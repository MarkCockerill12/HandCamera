import { dist2D, segmentDistance } from "./math";
import type { GestureLabel, GestureResult, HandFeatures } from "./types";

/** Angular tolerances, in degrees, applied to screen line-angles. */
const HORIZONTAL_TOL = 25;
const VERTICAL_TOL = 30;
const DIAGONAL_LOW = 25;
const DIAGONAL_HIGH = 65;

/** A line-angle in [0, 180) that reads as flat across the screen. */
const isHorizontal = (a: number) => a < HORIZONTAL_TOL || a > 180 - HORIZONTAL_TOL;
/** A line-angle that reads as upright. */
const isVertical = (a: number) => Math.abs(a - 90) < VERTICAL_TOL;
/** Leaning like "/" (up and to the right, as the mirrored preview shows it). */
const leansRight = (a: number, low = DIAGONAL_LOW, high = DIAGONAL_HIGH) => a >= low && a <= high;
/** Leaning like "\". */
const leansLeft = (a: number, low = DIAGONAL_LOW, high = DIAGONAL_HIGH) => a >= 180 - high && a <= 180 - low;
const isDiagonal = (a: number) => leansRight(a) || leansLeft(a);

/**
 * Plus and multiply are defined by the two index fingers physically crossing.
 * Measured on a real webcam: crossed fingers 0-0.09 index-lengths apart,
 * two-hand digit poses 2.9 and up. Requiring the cross keeps 1+1 a "2".
 */
const CROSS_DISTANCE = 0.5;
/**
 * Any crossing that is not a plus is a multiply, as long as the fingers are
 * not near-parallel. A real "X" drifted to 34 and 166-176 degrees, which no
 * fixed pair of diagonal sectors caught.
 */
const MIN_CROSS_ANGLE = 20;

/** Acute angle between two line-angles in [0, 180). */
const lineGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 180;
  return Math.min(d, 180 - d);
};

function indexFingersCross(a: HandFeatures, b: HandFeatures, xScale: number): boolean {
  const length = dist2D(a.screen[5], a.screen[8], xScale) || 1e-6;
  const gap = segmentDistance(a.screen[5], a.screen[8], b.screen[5], b.screen[8], xScale);
  return gap / length < CROSS_DISTANCE;
}

/** Exactly one finger extended, and it is the given one. */
const onlyFinger = (h: HandFeatures, idx: number) => h.count === 1 && h.fingers[idx];

/**
 * Index out, middle/ring/pinky folded. The thumb is ignored: when a hand points
 * sideways to make half of a plus sign, the thumb tends to stick up, and
 * demanding it be tucked made plus and multiply read as digits instead.
 */
const isPointing = (h: HandFeatures) =>
  h.fingers[1] && !h.fingers[2] && !h.fingers[3] && !h.fingers[4];

/**
 * Prayer / reset. Deliberately strict, because it wipes the calculator.
 *
 * The old rule fired on wrist proximity alone, so holding two hands up to sign
 * 6-10 would silently clear the display. This demands two flat, upright hands
 * whose wrists *and* fingertips are both touching.
 */
function isPrayer(a: HandFeatures, b: HandFeatures, xScale: number): boolean {
  if (!a.isFlat || !b.isFlat) return false;
  if (!isVertical(a.fingerAngle) || !isVertical(b.fingerAngle)) return false;

  const scale = (a.palmSpan + b.palmSpan) / 2;
  const wristGap = dist2D(a.screen[0], b.screen[0], xScale);
  const tipGap = dist2D(a.screen[12], b.screen[12], xScale);
  return wristGap < scale * 0.9 && tipGap < scale * 0.8;
}

/**
 * Maps a frame's hand features to a single gesture.
 *
 * Rules are ordered most-specific first, and every rule that can shadow a digit
 * carries a precondition strict enough that it cannot fire on an ordinary
 * counting pose. Anything unmatched falls through to the finger count, which is
 * always a sane answer.
 */
export function classify(hands: HandFeatures[], xScale: number): GestureResult {
  const totalFingers = hands.reduce((sum, h) => sum + h.count, 0);
  const done = (label: GestureLabel, reason: string): GestureResult => ({
    label, reason, hands, totalFingers,
  });

  if (hands.length === 0) return done(-1, "no hands");

  // ---------------- Two hands ----------------
  if (hands.length >= 2) {
    const [a, b] = hands;

    if (isPrayer(a, b, xScale)) return done(18, "two flat hands pressed together");

    // Both hands must be pointing with the index, and the fingers must touch.
    // The old rule only checked total finger count, so two fists at the right
    // angles read as a plus sign.
    if (isPointing(a) && isPointing(b) && indexFingersCross(a, b, xScale)) {
      const a1 = a.indexAngle;
      const a2 = b.indexAngle;

      if ((isHorizontal(a1) && isVertical(a2)) || (isVertical(a1) && isHorizontal(a2))) {
        return done(11, "index fingers crossed at right angles");
      }
      if (lineGap(a1, a2) >= MIN_CROSS_ANGLE) {
        return done(13, "index fingers crossed diagonally");
      }
    }

    if (totalFingers >= 0 && totalFingers <= 10) {
      return done(totalFingers as GestureLabel, `${totalFingers} fingers across two hands`);
    }
    return done(-1, "unrecognised two-hand pose");
  }

  // ---------------- One hand ----------------
  const h = hands[0];

  if (onlyFinger(h, 2)) return done(17, "middle finger only");

  if (onlyFinger(h, 0)) {
    // Signed angle, so up and down are distinguishable. A sideways thumb is
    // ambiguous and is left to fall through as a count of one.
    if (h.thumbAngle > 35 && h.thumbAngle < 145) return done(19, "thumb pointing up");
    if (h.thumbAngle < -35 && h.thumbAngle > -145) return done(20, "thumb pointing down");
  }

  // Blade hand: minus and divide. All four fingers straight *and* held together,
  // which is what distinguishes a blade from a tilted open "five". A blade held
  // upright is not a symbol, so it falls through to the digit rules below.
  if (h.isFlat && h.fingersTogether) {
    if (isHorizontal(h.fingerAngle)) return done(12, "flat blade held horizontally");
    if (isDiagonal(h.fingerAngle)) return done(14, "flat blade held diagonally");
  }

  return done(h.count as GestureLabel, `${h.count} fingers extended`);
}
