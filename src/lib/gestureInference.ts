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
  | 19 // Thumbs Up [v4.2 Debug]
  | 20 // Thumbs Down [v4.2 Debug]
  | -1; // No gesture



export interface Landmark {
  x: number;
  y: number;
  z: number;
}

interface HandAnalysis {
  count: number;
  isMiddleOnly: boolean;
  isIndexOnly: boolean;
  isMostlyMiddle: boolean; // Ignores thumb
  angleDegrees: number; // Tilt of the hand (0 = vertical)
  palmCenter: { x: number, y: number };
  extendedFingers: boolean[]; // [Thumb, Index, Middle, Ring, Pinky]
  isRingZero: boolean; // v4.6: Ring shape (O)
  isThumbDown: boolean; // v4.8: Thumb pointing down relative to wrist
  isThumbUp: boolean; // v4.8: Thumb pointing up relative to wrist
}

class GestureInference {
  private session: ort.InferenceSession | null = null;
  private readonly modelUrl: string = "https://huggingface.co/Hypernova823/HandCamera/resolve/main/hand_camera.onnx";
  public verboseDebug: boolean = false; // [v4.2] Toggle for deep tracing

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
      console.warn("[v3.4 Remote] Remote model fetch failed. System falling back to heuristic sub-routines.", error);
      this.session = null;
    }
  }

  /**
   * Normalizes landmarks for up to TWO hands (126 features total).
   * Matches the [1, 126] input shape expected by the HandNet model.
   */
  private extractFeatures(multiHandLandmarks: Landmark[][]): Float32Array {
    const inputData = new Float32Array(126); // Defaulted to 0.0

    for (let handIdx = 0; handIdx < Math.min(multiHandLandmarks.length, 2); handIdx++) {
      const landmarks = multiHandLandmarks[handIdx];
      if (!landmarks || landmarks.length === 0) continue;

      // v2.5: Find bounding box for "Virtual Centering" to match 128x128 training data
      let minX = 1, maxX = 0, minY = 1, maxY = 0;
      for (const lm of landmarks) {
        minX = Math.min(minX, lm.x); maxX = Math.max(maxX, lm.x);
        minY = Math.min(minY, lm.y); maxY = Math.max(maxY, lm.y);
      }

      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const width = maxX - minX;
      const height = maxY - minY;
      
      // Standardize size to 70% of the [0,1] range (v2.5 centering)
      const scale = 0.7 / Math.max(width, height, 0.01);

      const offset = handIdx * 63;
      for (let i = 0; i < landmarks.length; i++) {
        // Shift hand so its center is 0.5, 0.5 and scale it to a standard 'distance'
        inputData[offset + i * 3] = (landmarks[i].x - cx) * scale + 0.5;
        inputData[offset + i * 3 + 1] = (landmarks[i].y - cy) * scale + 0.5;
        inputData[offset + i * 3 + 2] = landmarks[i].z * scale;
      }
    }
    return inputData;
  }


  async predict(multiHandLandmarks: Landmark[][], multiHandedness?: { label: string }[]): Promise<number> {
    if (!this.session) {
      return this.mockPredict(multiHandLandmarks);
    }

    try {
      // 1. Prepare Features (126 landmarks)
      const inputData = this.extractFeatures(multiHandLandmarks);
      const tensorInput = new ort.Tensor('float32', inputData, [1, 126]);

      // 2. Run Inference
      const start = performance.now();
      const inputName = this.session.inputNames[0];
      const outputName = this.session.outputNames[0];
      const results = await this.session.run({ [inputName]: tensorInput });
      const processTime = performance.now() - start;
      const output = results[outputName].data as Float32Array;

      if (processTime > 50) {
        console.warn(`[v4.0 Performance] SLOW INFERENCE: ${processTime.toFixed(1)}ms`);
      }

      // 3. Process Softmax & Top Result
      const probs = this.softmax(output);
      const maxProb = Math.max(...probs);
      const topLabelIdx = probs.indexOf(maxProb);

      // 4. v4.9 Deep Diagnostic [High Overhead - Only during verboseDebug]
      if (this.verboseDebug) {
        const topK = this.getTopKIndices(probs, 3);
        const topKLog = topK.map(t => `${t.label} (${(t.prob * 100).toFixed(0)}%)`).join(', ');
        const hCounts = multiHandLandmarks.map((h, i) => this.analyzeHandHeuristic(h, multiHandedness?.[i]?.label || 'Right').count);
        console.log(`[v4.9 Diagnostic] AI Top-3: ${topKLog} | Fingers: ${hCounts.join('+')} | Hands: ${multiHandLandmarks.length}`);
      }

      // 4.1 Heuristic Preparation
      const handAnalyses: HandAnalysis[] = multiHandLandmarks.map((hand, idx) => {
        const handedness = multiHandedness?.[idx]?.label || 'Right';
        return this.analyzeHandHeuristic(hand, handedness);
      });

      const totalHCount = handAnalyses.reduce((sum, a) => sum + a.count, 0);
      const isAnyMostlyMiddle = handAnalyses.some(a => a.isMostlyMiddle);

      let finalizedLabel = topLabelIdx;

      // RULE #0: Symbol/Prayer Immunity (v2.9)
      // If AI is reasonably confident it's a Symbol or Prayer, skip numeric correction.
      const isSymbolAI = (topLabelIdx >= 11 && topLabelIdx <= 16) || topLabelIdx === 18;
      
      // RULE #0.5: Multi-Hand Coordination (v4.6)
      if (handAnalyses.length === 2) {
        const h1 = handAnalyses[0];
        const h2 = handAnalyses[1];
        const dist = Math.hypot(h1.palmCenter.x - h2.palmCenter.x, h1.palmCenter.y - h2.palmCenter.y);
        
        // Use relative angle to distinguish between Plus, Multiply, and Prayer
        const angleDiff = Math.abs(h1.angleDegrees - h2.angleDegrees);

        if (dist < 0.55) {
          const a1 = Math.abs(h1.angleDegrees);
          const a2 = Math.abs(h2.angleDegrees);
          
          // Log Raw State for crossing
          if (this.verboseDebug) {
             console.log(`[v5.0 Diagnostic] CROSSING CANDIDATE: Dist=${dist.toFixed(2)} | A1=${a1.toFixed(0)} | A2=${a2.toFixed(0)} | Diff=${angleDiff.toFixed(0)}`);
          }

          // Case 1: Square Crossing -> Plus (11)
          // One hand vertical, one horizontal (roughly)
          const isOneVertical = a1 < 25 || a2 < 25;
          const isOneHorizontal = a1 > 65 || a2 > 65;
          
          if (isOneVertical && isOneHorizontal) {
             if (this.verboseDebug) console.log(`[v5.0 LOUD] SQUARE CROSSING: Plus (11)`);
             return 11;
          }

          // Case 2: Diagonal Crossing -> Multiply (13)
          // Both hands slanted
          const areBothDiagonal = a1 > 20 && a1 < 70 && a2 > 20 && a2 < 70;
          if (areBothDiagonal) {
             if (this.verboseDebug) console.log(`[v5.0 LOUD] DIAGONAL CROSSING: Multiply (13)`);
             return 13;
          }

          // Case 3: Parallel -> Prayer (18)
          if (angleDiff < 25 && dist < 0.22) {
             if (this.verboseDebug) console.log(`[v5.0 LOUD] PARALLEL PALMS: Prayer (18)`);
             return 18; 
          }
        }
      }

      // RULE #0.7: Single Hand Heuristics (v5.1)
      if (handAnalyses.length === 1) {
        const analysis = handAnalyses[0];
        const rotation = Math.abs(analysis.angleDegrees);

        // RULE #0.1: Absolute Physical Overrides (v5.5)
        // O-Shape / Ring Zero has absolute priority over ALL other symbolic/diagonal rules.
        if (handAnalyses.length === 1 && handAnalyses[0].isRingZero) {
          if (this.verboseDebug) console.log(`[v5.5 ABSOLUTE] RING ZERO VETO ACTIVE`);
          return 0;
        }

        // RULE #0.8: Thumbs Up / Down [v5.5 Hardened - BINARY TUNING]
        // v5.4: Use Binary Y-Comparison for single-finger thumb states.
        const isThumbFirmlyExtended = analysis.extendedFingers[0] && !analysis.extendedFingers.slice(1).some(Boolean);
        
        if (isThumbFirmlyExtended) {
          const thumbTip = multiHandLandmarks[0][4];
          const thumbMCP = multiHandLandmarks[0][2];
          const isDown = thumbTip.y > thumbMCP.y; // Screen-space Down (Higher Y)

          if (this.verboseDebug) {
            console.warn(`[v5.5 BINARY] THUMB: Tip.y=${thumbTip.y.toFixed(3)}, MCP.y=${thumbMCP.y.toFixed(3)} -> ${isDown ? 'BACKSPACE' : 'EQUALS'}`);
          }

          return isDown ? 20 : 19;
        } else if (this.verboseDebug && (topLabelIdx === 19 || topLabelIdx === 20)) {
          console.log(`[v5.5 Trace] Rule 0.8 SKIPPED for ${topLabelIdx}: extendedFingers=[${analysis.extendedFingers.join(',')}]`);
        }

        // RULE #0.7: Diagonal Single Hand -> Divide (14) [v5.1]
        // v5.5: Explicitly suppressed for low finger counts (fists/thumbs) to prevent hijacking.
        const isDiagonal = rotation > 25 && rotation < 65; 
        const isAILikelyDivide = topLabelIdx === 14 && maxProb > 0.6;
        const isMultiFingerDiagonal = analysis.count >= 4 && isDiagonal;
        
        if (isMultiFingerDiagonal || (isAILikelyDivide && (analysis.count === 1 || analysis.count >= 4))) {
            if (this.verboseDebug) {
              console.log(`[v5.5 LOUD] SLASH DETECTED: Divide (14) [Angle=${rotation.toFixed(0)}°, Count=${analysis.count}, AI_Prob=${maxProb.toFixed(2)}]`);
            }
            return 14;
        }

        // RULE #0.9: Horizontal Index -> Minus (12) [v4.4]
        // If AI thinks it's '1' but the finger is horizontal, it's likely a Minus.
        const isHorizontalOne = topLabelIdx === 1 && rotation > 70;
        if (isHorizontalOne) {
            if (this.verboseDebug) console.log(`[v4.4 Trace] HORIZONTAL OVERRIDE: ${topLabelIdx} -> 12 (Minus) [Rotation: ${rotation.toFixed(1)}°]`);
            return 12;
        }
      }

      if (isSymbolAI && maxProb > 0.5) {
        // Tie-breaker for Plus (11) vs Multiply (13) based on Rotation
        if (topLabelIdx === 11 || topLabelIdx === 13) {
          const rotation = Math.abs(handAnalyses[0]?.angleDegrees || 0);
          const orientation = rotation > 20 && rotation < 70 ? 'Diagonal' : 'Square';
          const suggestedByRotation = orientation === 'Diagonal' ? 13 : 11;
          
          if (topLabelIdx !== suggestedByRotation) {
            if (this.verboseDebug) console.log(`[v4.2 Trace] ROTATION OVERRIDE: ${topLabelIdx} -> ${suggestedByRotation}`);
            return suggestedByRotation;
          }
        }
        
        console.log(`[v3.9 Logic] SYMBOL IMMUNITY: ${topLabelIdx} (Confidence: ${(maxProb * 100).toFixed(1)}%)`);
        return topLabelIdx;
      }

      // RULE #1: The Rude Gesture Protection (17)
      if (topLabelIdx === 17) {
        if (isAnyMostlyMiddle) {
          console.log(`[v3.9 Logic] APPROVED Rude Gesture 17. Thumb-agnostic check confirmed.`);
        } else {
          console.log(`[v3.9 Logic] REJECTED Rude Gesture 17. Finger map not matching 'Mostly Middle'.`);
          finalizedLabel = totalHCount; 
        }
      } 
      // RULE #2: Numeric Verification (0-10)
      else if (topLabelIdx <= 10) {
        // v5.5 Slant-Trust Logic: If the hand is slanted (>40 degrees), we trust the AI symbolic intent.
        // Numbers 1-10 are rarely performed at an angle. This fixes the "Thumbs Down -> 3" correction bug.
        const isSlanted = handAnalyses.length === 1 && Math.abs(handAnalyses[0].angleDegrees) > 40;
        
        if (isSlanted && topLabelIdx === 0 && maxProb < 0.2) {
           // If AI is extremely unsure and it's slanted, fall through to finalizedLabel
        } else if (totalHCount !== topLabelIdx && maxProb < 0.95 && !isSlanted) {
          if (this.verboseDebug) console.log(`[v3.9 Logic] Numeric Correct: ${topLabelIdx} -> ${totalHCount}`);
          finalizedLabel = totalHCount;
        } else if (isSlanted) {
          if (this.verboseDebug) console.log(`[v5.5 ABSOLUTE] SLANT TRUST: Prioritizing AI/${topLabelIdx} over Count/${totalHCount}`);
        }
      }
      // RULE #3: AI-Hate Catch (v2.9)
      else if (topLabelIdx === -1 && totalHCount > 0) {
         finalizedLabel = totalHCount;
      }

      return finalizedLabel;
    } catch (error) {
      console.error("[v3.5 HUD] Neural core failure:", error);
      return -1;
    }
  }

  private analyzeHandHeuristic(landmarks: Landmark[], handedness: string): HandAnalysis {
    if (!landmarks || landmarks.length < 21) {
      return { 
        count: 0, isMiddleOnly: false, isIndexOnly: false, isMostlyMiddle: false, 
        angleDegrees: 0, palmCenter: { x: 0, y: 0 }, extendedFingers: [false, false, false, false, false],
        isRingZero: false, isThumbDown: false, isThumbUp: false
      };
    }
    
    // 1. Calculate Tilt (v5.2: Multi-point average for 3D stability)
    // Use average of all finger MCPs (5, 9, 13, 17) vs Wrist (0)
    const wrist = landmarks[0];
    const fingerBases = [5, 9, 13, 17];
    const avgMCP = {
      x: fingerBases.reduce((sum, idx) => sum + landmarks[idx].x, 0) / 4,
      y: fingerBases.reduce((sum, idx) => sum + landmarks[idx].y, 0) / 4
    };
    
    const dx = avgMCP.x - wrist.x;
    const dy = avgMCP.y - wrist.y;
    const angleRad = Math.atan2(dx, -dy); // -dy because y is inverted in video
    const angleDegrees = angleRad * (180 / Math.PI);

    // 2. Palm Center (Use the refined avgMCP)
    const palmCenter = { x: (wrist.x + avgMCP.x) / 2, y: (wrist.y + avgMCP.y) / 2 };

    const extended = [false, false, false, false, false];

    // 3. Thumb Tuning
    const thumbTip = landmarks[4];
    const thumbIP = landmarks[3];
    const indexMCP = landmarks[5];
    const distToPalm = Math.hypot(thumbTip.x - indexMCP.x, thumbTip.y - indexMCP.y);
    const thumbClassic = handedness === 'Right' ? thumbTip.x < thumbIP.x : thumbTip.x > thumbIP.x;
    // v5.2: Symmetry-agnostic override. If thumb is far ($>0.18$), it's extended regardless of X-handedness.
    const isAgnosticThumb = distToPalm > 0.18;
    extended[0] = (thumbClassic && distToPalm > 0.12) || isAgnosticThumb; 

    // 4. Others (Tip Y relative to PIP)
    const joints = [[8, 6], [12, 10], [16, 14], [20, 18]];
    joints.forEach((j, i) => {
      if (landmarks[j[0]].y < landmarks[j[1]].y) extended[i + 1] = true;
    });

    const count = extended.filter(Boolean).length;
    const isMiddleOnly = count === 1 && extended[2]; 
    const isIndexOnly = count === 1 && extended[1];
    
    const fingersUpCount = extended.slice(1).filter(Boolean).length;
    const isMostlyMiddle = fingersUpCount === 1 && extended[2];

    // v4.7: Ring-Finger Ring (O-Shape) detection
    // Check thumb tip distance to ALL finger tips
    const fingerTips = [landmarks[8], landmarks[12], landmarks[16], landmarks[20]];
    const minDistToThumb = Math.min(...fingerTips.map(f => Math.hypot(landmarks[4].x - f.x, landmarks[4].y - f.y)));
    
    // v5.5: Relaxed distance threshold for casusal "O" circles (Absolute Veto Mode).
    const isRingZero = minDistToThumb < 0.15; 

    // v5.3: Directional Thumbs (Tip vs MCP + Wrist)
    // Down means tip is below wrist and below thumb joint
    const thumbMCP = landmarks[2];
    const isThumbDown = thumbTip.y > wrist.y && thumbTip.y > thumbMCP.y && thumbTip.y > landmarks[8].y;
    const isThumbUp = thumbTip.y < wrist.y && thumbTip.y < thumbMCP.y && thumbTip.y < landmarks[8].y;

    return { 
      count, isMiddleOnly, isIndexOnly, isMostlyMiddle, 
      angleDegrees, palmCenter, extendedFingers: extended, 
      isRingZero, isThumbDown, isThumbUp
    };
  }

  private softmax(logits: Float32Array): Float32Array {
    const maxLogit = Math.max(...logits);
    const scores = logits.map((l) => Math.exp(l - maxLogit));
    const sum = scores.reduce((a, b) => a + b, 0);
    return scores.map((s) => s / sum);
  }

  /**
   * Returns top K indices and probabilities.
   */
  private getTopKIndices(probs: Float32Array, k: number): { label: number, prob: number }[] {
    const indexed = Array.from(probs).map((p, i) => ({ label: i, prob: p }));
    return indexed.sort((a, b) => b.prob - a.prob).slice(0, k);
  }

  private mockPredict(multiHandLandmarks: Landmark[][]): GestureLabel {
    if (multiHandLandmarks.length === 2) {
      const h1Wrist = multiHandLandmarks[0][0];
      const h1IndexBase = multiHandLandmarks[0][5];
      const h2Wrist = multiHandLandmarks[1][0];
      
      const h1Scale = Math.hypot(h1IndexBase.x - h1Wrist.x, h1IndexBase.y - h1Wrist.y);
      const wristDist = Math.hypot(h1Wrist.x - h2Wrist.x, h1Wrist.y - h2Wrist.y);
      
      if (wristDist < h1Scale * 1.5) {
        return 18; // Prayer
      }
    }

    let totalFingers = 0;
    let handsWithOnlyMiddleFinger = 0;

    for (const landmarks of multiHandLandmarks) {
      if (!landmarks || landmarks.length < 21) continue;

      let fingersExtended = 0;
      const fingerTips = [8, 12, 16, 20];
      const fingerPIPs = [6, 10, 14, 18];
      const wrist = landmarks[0];
      
      // Aspect ratio aware distance (assuming 4:3)
      const aspectX = 1.33;
      const aspectY = 1;

      const extendedStatus = fingerTips.map((tipIdx, i) => {
        const dxTip = (landmarks[tipIdx].x - wrist.x) * aspectX;
        const dyTip = (landmarks[tipIdx].y - wrist.y) * aspectY;
        const dxPip = (landmarks[fingerPIPs[i]].x - wrist.x) * aspectX;
        const dyPip = (landmarks[fingerPIPs[i]].y - wrist.y) * aspectY;

        const dTip = Math.hypot(dxTip, dyTip);
        const dPip = Math.hypot(dxPip, dyPip);
        const isExt = dTip > dPip * 1.1; // Add 10% threshold for stability
        if (isExt) fingersExtended++;
        return isExt;
      });

      // Thumb logic (more complex due to unique motion)
      const thumbTip = landmarks[4];
      const indexBase = landmarks[5];
      const pinkyBase = landmarks[17];
      
      const dxThumb = (thumbTip.x - indexBase.x) * aspectX;
      const dyThumb = (thumbTip.y - indexBase.y) * aspectY;
      const dThumb = Math.hypot(dxThumb, dyThumb);
      
      const dxPalm = (indexBase.x - pinkyBase.x) * aspectX;
      const dyPalm = (indexBase.y - pinkyBase.y) * aspectY;
      const palmWidth = Math.hypot(dxPalm, dyPalm);

      const thumbExtended = dThumb > palmWidth * 0.6;
      if (thumbExtended) fingersExtended++;

      totalFingers += fingersExtended;

      if (fingersExtended === 1 && extendedStatus[1] && !thumbExtended) {
        handsWithOnlyMiddleFinger++;
      }
    }

    if (handsWithOnlyMiddleFinger === 1 && multiHandLandmarks.length === 1) {
      return 17; // Sad
    }

    // Clamp sum to standard 0-10 range for numeric input
    const finalCount = Math.min(Math.max(totalFingers, 0), 10);
    return (finalCount as GestureLabel);
  }



}

export const gestureInference = new GestureInference();
