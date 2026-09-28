export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export type GestureLabel =
  | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
  | 11 // Plus
  | 12 // Minus
  | 13 // Multiply
  | 14 // Divide
  | 17 // Rude
  | 18 // Reset (prayer)
  | 19 // Thumbs up  -> equals
  | 20 // Thumbs down -> backspace
  | -1; // Unknown

export const GESTURE_NAMES: Record<number, string> = {
  0: "Zero", 1: "One", 2: "Two", 3: "Three", 4: "Four", 5: "Five",
  6: "Six", 7: "Seven", 8: "Eight", 9: "Nine", 10: "Ten",
  11: "Plus (+)", 12: "Minus (-)", 13: "Multiply (x)", 14: "Divide (/)",
  17: "Rude", 18: "Reset", 19: "Thumbs Up (=)", 20: "Thumbs Down (bksp)",
  [-1]: "None",
};

export const FINGER_NAMES = ["Thumb", "Index", "Middle", "Ring", "Pinky"] as const;

/**
 * Everything the classifier needs to know about one hand, derived once per frame.
 *
 * Finger state comes from `world` (metric 3D, origin at the hand's centre) so it is
 * immune to perspective foreshortening. Orientation comes from `screen` (normalized
 * image coords) because "horizontal" and "diagonal" only mean anything on screen.
 */
export interface HandFeatures {
  handedness: "Left" | "Right";
  screen: Landmark[];
  world: Landmark[];
  /** [thumb, index, middle, ring, pinky] */
  fingers: boolean[];
  count: number;
  /** Knuckle-to-knuckle width (index MCP -> pinky MCP), aspect-corrected screen units. */
  palmSpan: number;
  /** Screen line-angle of the middle finger, 0-180 where 0 = horizontal, 90 = vertical. */
  fingerAngle: number;
  /** Screen line-angle of the palm (wrist -> middle MCP), same convention. */
  palmAngle: number;
  /** Screen line-angle of the index finger, same convention. */
  indexAngle: number;
  /** Signed screen angle of the thumb in (-180, 180], where +90 points up. */
  thumbAngle: number;
  /** Mean adjacent-fingertip gap as a multiple of palm span. */
  tipGap: number;
  /** True when the four fingers are held as a blade rather than splayed. */
  fingersTogether: boolean;
  /** True when index..pinky are all extended. */
  isFlat: boolean;
  /** Raw measurements in degrees, surfaced for the debug overlay. */
  jointAngles: { curls: number[]; thumbOut: number };
  /** False when MediaPipe gave no world landmarks and we fell back to screen space. */
  usingWorld: boolean;
}

export interface GestureResult {
  label: GestureLabel;
  /** Human-readable explanation of which rule fired. Shown in test mode. */
  reason: string;
  hands: HandFeatures[];
  totalFingers: number;
}
