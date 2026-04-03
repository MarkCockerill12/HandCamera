import * as ort from "onnxruntime-web";

export type GestureLabel =
  | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
  | 11 // Plus
  | 12 // Minus
  | 13 // Multiply
  | 14 // Divide
  | 15 // Equals
  | 16 // Backspace
  | 17 // Sad Face (Insolent Finger)
  | 18 // Prayer Protocol
  | 19 // Thumbs Up (Alternate Equals)
  | 20 // Thumbs Down (Alternate Backspace)
  | -1; // Unknown

class GestureInference {
  private session: ort.InferenceSession | null = null;
  public verboseDebug = false;

  async loadModel() {
    if (this.session) return;
    
    // [v5.3] Adaptive Backend Selection
    // Try WebGL for GPU acceleration, fallback to WASM for compatibility
    const providers = ["webgl", "wasm"];
    
    for (const provider of providers) {
      try {
        console.log(`[v5.3 Neural Core] Attempting initialization with ${provider} backend...`);
        this.session = await ort.InferenceSession.create("/model/gesture_model.onnx", {
          executionProviders: [provider],
          graphOptimizationLevel: "all",
        });
        console.log(`[v5.3 Neural Core] Success. Backend: ${provider.toUpperCase()}.`);
        return; // Success!
      } catch (e) {
        console.warn(`[v5.3 Neural Core] Backend ${provider} failed.`, e);
        // Continue to next provider
      }
    }
    
    console.error("[v5.3 Neural Core] CRITICAL: All ONNX backends failed. System offline.");
  }

  private getFingerExtensions(landmarks: any[]): boolean[] {
    const fingerTips = [8, 12, 16, 20];
    const fingerPIPs = [6, 10, 14, 18];
    const wrist = landmarks[0];
    const aspect = 1.33;
    const extended = [false, false, false, false, false];
    
    // Thumb
    const thumbTip = landmarks[4];
    const indexBase = landmarks[5];
    const dThumb = Math.hypot((thumbTip.x - indexBase.x) * aspect, thumbTip.y - indexBase.y);
    const wristScale = Math.hypot((wrist.x - indexBase.x) * aspect, wrist.y - indexBase.y);
    extended[0] = dThumb > wristScale * 0.7;

    // Fingers
    fingerTips.forEach((tipIdx, i) => {
      const tip = landmarks[tipIdx];
      const pip = landmarks[fingerPIPs[i]];
      const dxTip = (tip.x - wrist.x) * aspect;
      const dyTip = (tip.y - wrist.y) * aspect;
      const dxPip = (pip.x - wrist.x) * aspect;
      const dyPip = (pip.y - wrist.y) * aspect;
      extended[i + 1] = Math.hypot(dxTip, dyTip) > Math.hypot(dxPip, dyPip) * 1.15;
    });

    return extended;
  }

  private async runInference(multiHandLandmarks: any[][]): Promise<{ label: number; prob: number }> {
    if (!this.session) return { label: -1, prob: 0 };
    const inputData = new Float32Array(126);
    multiHandLandmarks.slice(0, 2).forEach((hand, hIdx) => {
      hand.forEach((lm: any, lIdx: number) => {
        inputData[hIdx * 63 + lIdx * 3] = lm.x;
        inputData[hIdx * 63 + lIdx * 3 + 1] = lm.y;
        inputData[hIdx * 63 + lIdx * 3 + 2] = lm.z;
      });
    });

    try {
      const tensorInput = new ort.Tensor("float32", inputData, [1, 126]);
      const results = await this.session.run({ input: tensorInput });
      const output = results.output.data as Float32Array;
      const scores = Array.from(output);
      const maxVal = Math.max(...scores);
      const label = scores.indexOf(maxVal);
      const sumExp = scores.reduce((a, b) => a + Math.exp(b - maxVal), 0);
      const prob = 1 / sumExp; // Softmax simplified
      return { label, prob };
    } catch (e) {
      if (this.verboseDebug) console.error("[v5.2 Trace] AI Inference Error", e);
      return { label: -1, prob: 0 };
    }
  }

  /**
   * Main prediction pipeline
   */
  async predict(
    multiHandLandmarks: any[][],
    _multiHandedness: { label: string }[] = []
  ): Promise<GestureLabel> {
    if (!this.session || !multiHandLandmarks || multiHandLandmarks.length === 0) return -1;

    const landmarks = multiHandLandmarks[0];
    const extended = this.getFingerExtensions(landmarks);
    const fingerCount = extended.filter(Boolean).length;
    const { label: aiLabel, prob: aiProb } = await this.runInference(multiHandLandmarks);
    const aspect = 1.33;

    // Fusion Logic [v5.5]
    // 1. Absolute Heuristics (Prioritized for speed and 100% accuracy on basic counts)
    if (aiProb < 0.95) { // If AI isn't extremely certain, heuristics take charge for 0-10
      if (fingerCount >= 0 && fingerCount <= 10) {
        // Validation: If AI thinks it's a digit but heuristic count is different,
        // we trust the physical count (landmarks don't lie about extension).
        if (aiLabel >= 0 && aiLabel <= 10 && aiLabel !== fingerCount) {
             if (this.verboseDebug) console.log(`[v5.5] Heuristic override: AI=${aiLabel}, Phys=${fingerCount}`);
        }
        
        // Instant return for clear physical counts if AI is ambiguous
        if (aiProb < 0.7) return (fingerCount as GestureLabel);
      }
    }

    // 2. Specialized Operator Heuristics
    // Divide Heuristic
    const palmRotation = Math.atan2(landmarks[17].y - landmarks[5].y, (landmarks[17].x - landmarks[5].x) * aspect);
    const rotationDeg = Math.abs(palmRotation * (180 / Math.PI));
    if (fingerCount === 1 && rotationDeg > 60 && (aiLabel === 14 || aiProb < 0.5)) return 14; 

    // Prayer Heuristic (Reset)
    if (multiHandLandmarks.length === 2) {
      const dWrist = Math.hypot((multiHandLandmarks[0][0].x - multiHandLandmarks[1][0].x) * aspect, multiHandLandmarks[0][0].y - multiHandLandmarks[1][0].y);
      if (dWrist < 0.15) return 18; 
    }

    // 3. AI Core (For complex operators: +, -, *, BKSP, Equals)
    if (aiProb > 0.4) return (aiLabel as GestureLabel);

    // 4. Final Fallbacks
    if (fingerCount >= 0 && fingerCount <= 10) return (fingerCount as GestureLabel);

    return -1;
  }
}

export const gestureInference = new GestureInference();
