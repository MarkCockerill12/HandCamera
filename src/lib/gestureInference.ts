import * as ort from "onnxruntime-web";

export type GestureLabel = 
  | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
  | 11 // Plus
  | 12 // Minus
  | 13 // Multiply
  | 14 // Divide
  | 15 // Equals
  | 16 // Backspace
  | 17 // Sad Face (Insult)
  | 18 // Prayer Protocol
  | -1; // No gesture



export interface Landmark {
  x: number;
  y: number;
  z: number;
}

class GestureInference {
  private session: ort.InferenceSession | null = null;
  private readonly modelUrl: string = "https://huggingface.co/Hypernova823/HandCamera/resolve/main/hand_camera.onnx";

  constructor() {
    // WASM paths for ONNX Runtime Web
    try {
      ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/";
    } catch (e) {
      console.warn("ONNX WASM paths already set or error setting them:", e);
    }
  }

  async loadModel() {
    if (this.session) return;
    try {
      console.log(`[v3.3 Remote] Fetching AI Model from: ${this.modelUrl}`);
      const response = await fetch(this.modelUrl);
      if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);
      
      const modelBuffer = await response.arrayBuffer();
      this.session = await ort.InferenceSession.create(modelBuffer);
      console.log("[v3.3 Remote] Neural core synchronized successfully in RAM.");
    } catch (error) {
      // Gracefully handle missing model - the app will use mockPredict fallback
      console.warn("[v3.3 Remote] Remote model fetch failed. Using heuristic fallback.", error);
      this.session = null;
    }
  }

  /**
   * Normalizes landmarks for up to TWO hands (126 features total).
   * Matches the [1, 126] input shape expected by the HandNet model.
   */
  private normalizeLandmarks(multiHandLandmarks: Landmark[][]): Float32Array {
    const inputData = new Float32Array(126); 

    for (let handIdx = 0; handIdx < Math.min(multiHandLandmarks.length, 2); handIdx++) {
      const landmarks = multiHandLandmarks[handIdx];
      if (!landmarks || landmarks.length === 0) continue;

      const wrist = landmarks[0];
      const offset = handIdx * 63;

      for (let i = 0; i < landmarks.length; i++) {
        inputData[offset + i * 3] = landmarks[i].x - wrist.x;
        inputData[offset + i * 3 + 1] = landmarks[i].y - wrist.y;
        inputData[offset + i * 3 + 2] = landmarks[i].z - wrist.z;
      }
    }

    return inputData;
  }


  async predict(multiHandLandmarks: Landmark[][]): Promise<GestureLabel> {
    if (!multiHandLandmarks || multiHandLandmarks.length === 0) return -1;

    // Use mock counting logic if model isn't loaded
    if (!this.session) {
      return this.mockPredict(multiHandLandmarks);
    }

    try {
      // Create the 126-feature input vector from all detected hands
      const inputData = this.normalizeLandmarks(multiHandLandmarks);
      const inputTensor = new ort.Tensor("float32", inputData, [1, 126]);
      const feeds = { [this.session.inputNames[0]]: inputTensor };

      
      const results = await this.session.run(feeds);
      const output = results[this.session.outputNames[0]];
      const probabilities = output.data as Float32Array;
      
      let maxIdx = -1;
      let maxProb = 0;
      for (let i = 0; i < probabilities.length; i++) {
        if (probabilities[i] > maxProb) {
          maxProb = probabilities[i];
          maxIdx = i;
        }
      }

      return maxProb > 0.7 ? (maxIdx as GestureLabel) : -1;
    } catch (error) {
      console.error("[v3.1 HUD] Inference error:", error);
      return -1;
    }
  }

  private mockPredict(multiHandLandmarks: Landmark[][]): GestureLabel {
    // 1. Identify "Prayer Protocol" (Palms Clasped)
    if (multiHandLandmarks.length === 2) {
      const h1Wrist = multiHandLandmarks[0][0];
      const h2Wrist = multiHandLandmarks[1][0];
      const distance = Math.hypot(h1Wrist.x - h2Wrist.x, h1Wrist.y - h2Wrist.y);
      
      // If wrists are very close together (clasping hands), trigger Prayer Protocol
      if (distance < 0.1) {
        return 18; // New index for Prayer
      }
    }


    // 2. Identify Finger Counting (0-10)
    let totalFingers = 0;
    let handsWithOnlyMiddleFinger = 0;

    for (const landmarks of multiHandLandmarks) {
      if (!landmarks || landmarks.length < 21) continue;

      let fingersExtended = 0;
      const fingerTips = [8, 12, 16, 20];
      const fingerPIPs = [6, 10, 14, 18];
      
      const extendedStatus = fingerTips.map((tipIdx, i) => {
        const isExt = landmarks[tipIdx].y < landmarks[fingerPIPs[i]].y;
        if (isExt) fingersExtended++;
        return isExt;
      });

      // Thumb logic
      const thumbTip = landmarks[4];
      const indexBase = landmarks[5];
      const wrist = landmarks[0];
      const dThumb = Math.hypot(thumbTip.x - indexBase.x, thumbTip.y - indexBase.y);
      const wristScale = Math.hypot(wrist.x - indexBase.x, wrist.y - indexBase.y);
      const thumbExtended = dThumb > wristScale * 0.8;
      if (thumbExtended) fingersExtended++;

      totalFingers += fingersExtended;

      // Check specifically if ONLY the middle finger (index 1 in extendedStatus) is raised
      if (fingersExtended === 1 && extendedStatus[1] && !thumbExtended) {
        handsWithOnlyMiddleFinger++;
      }
    }

    // Identify Phalangeal Insult (exactly one hand showing only the middle finger)
    if (handsWithOnlyMiddleFinger === 1 && multiHandLandmarks.length === 1) {
      return 17; // New index for Sad
    }


    return (totalFingers as GestureLabel);
  }



}

export const gestureInference = new GestureInference();
