import type { Results } from "@mediapipe/hands";

import { classify } from "./classifier";
import { buildHandFeatures } from "./handFeatures";
import { dist2D } from "./math";
import type { GestureResult, Landmark } from "./types";

export { THRESHOLDS } from "./handFeatures";
export { FINGER_NAMES, GESTURE_NAMES } from "./types";
export type { GestureLabel, GestureResult, HandFeatures, Landmark } from "./types";

/**
 * MediaPipe sometimes reports one physical hand twice: two detections with the
 * same handedness sitting on top of each other. On a real webcam this turned a
 * single flat hand (divide) into "Ten" in 8 of 11 frames. Measured mean
 * landmark distance: duplicates 0.14-0.32 palm widths, genuine two-hand poses
 * 1.7 and up (crossed index fingers for plus/times are the closest).
 */
const DUPLICATE_HAND_DISTANCE = 0.8;

function isDuplicate(a: Landmark[], b: Landmark[], xScale: number): boolean {
  const span = dist2D(a[5], a[17], xScale) || 1e-6;
  let total = 0;
  for (let i = 0; i < 21; i++) total += dist2D(a[i], b[i], xScale);
  return total / 21 / span < DUPLICATE_HAND_DISTANCE;
}

class GestureEngine {
  /**
   * Video width / height. MediaPipe normalizes x and y independently against
   * the frame, so x has to be rescaled before any screen-space angle or
   * distance means anything.
   */
  public aspectRatio = 4 / 3;

  /**
   * Whether the preview the user is looking at is mirrored. Landmarks arrive in
   * raw camera space; flipping the x scale reinterprets every angle in the
   * orientation the user actually sees, so a blade that looks like "/" on screen
   * is measured as "/". Distances are unaffected — the term gets squared.
   */
  public mirrored = true;

  private get xScale() {
    return this.aspectRatio * (this.mirrored ? -1 : 1);
  }

  read(results: Results): GestureResult {
    const screenHands = results.multiHandLandmarks ?? [];
    const worldHands = results.multiHandWorldLandmarks ?? [];
    const handedness = results.multiHandedness ?? [];

    const features = screenHands
      // Must come before anything that indexes into a hand: MediaPipe can hand
      // back an empty or short landmark list, and this runs on every frame.
      .map((screen, i) => ({ screen: screen as Landmark[], index: i }))
      .filter((h) => h.screen && h.screen.length >= 21)
      .map((h) => {
        // Handedness also gives us a stable identity for each hand, which raw
        // detection order does not: MediaPipe reorders slots between frames.
        // It is reported against the raw frame, so a mirrored preview inverts it.
        const raw = handedness[h.index]?.label ?? (h.screen[0].x < 0.5 ? "Left" : "Right");
        const label = this.mirrored ? (raw === "Left" ? "Right" : "Left") : raw;
        return { screen: h.screen, world: worldHands[h.index] as Landmark[] | undefined, label };
      })
      .filter((h, i, all) =>
        !all.slice(0, i).some((prev) => prev.label === h.label && isDuplicate(prev.screen, h.screen, this.xScale))
      )
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((h) => buildHandFeatures(h.screen, h.world, h.label, this.xScale));

    return classify(features, this.xScale);
  }
}

export const gestureEngine = new GestureEngine();
