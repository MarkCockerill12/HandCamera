import { angleAt, dist2D, dist3, dot3, length3, lineAngle, signedAngle, sub } from "./math";
import type { HandFeatures, Landmark } from "./types";

/**
 * Landmark indices, per the MediaPipe Hands topology.
 * Each finger is [MCP, PIP, DIP, TIP]; the thumb is [CMC, MCP, IP, TIP].
 */
export const WRIST = 0;
const THUMB = [1, 2, 3, 4];
const INDEX_MCP = 5;
const MIDDLE_MCP = 9;
const MIDDLE_TIP = 12;
const PINKY_MCP = 17;

/**
 * Curl is one angle per finger, taken at the middle point of a triple, following
 * fingerpose (github.com/andypotato/fingerpose). The chain is deliberately long
 * so the value swings widely between folded and extended.
 *
 * Non-thumb fingers use (wrist, PIP, TIP): near-straight when the finger is out,
 * sharply bent when it curls back toward the palm. The thumb uses (CMC, IP, TIP),
 * since it has no comparable reach back to the wrist.
 */
const CURL_TRIPLES = [
  [THUMB[0], THUMB[2], THUMB[3]], // thumb:  1 ->  3 ->  4
  [WRIST, 6, 8],                  // index:  0 ->  6 ->  8
  [WRIST, 10, 12],                // middle: 0 -> 10 -> 12
  [WRIST, 14, 16],                // ring:   0 -> 14 -> 16
  [WRIST, 18, 20],                // pinky:  0 -> 18 -> 20
];

/**
 * Tuning constants. Angles are in degrees, measured on the metric world
 * landmarks so they do not shift when the hand moves toward or away from the lens.
 */
export const THRESHOLDS = {
  /**
   * Index to pinky. Measured through the real MediaPipe pipeline on photos of
   * real hands: extended fingers read 126-157, folded ones 3-42. fingerpose's
   * 130 sat on top of the extended range, so an ordinary open hand dropped its
   * index finger (10 read as 8 or 9). 100 splits the two clusters with room
   * on both sides for webcam jitter.
   */
  EXTENDED_ANGLE: 100,
  /**
   * Thumb, primary test: how far the thumb tip sits *outside* the index
   * knuckle, along the knuckle line (index MCP -> pinky MCP), in palm widths.
   * Measured on a real webcam: tucked thumbs -0.56..+0.30, extended thumbs in
   * counting and thumbs-up poses +0.48..+1.03. Curl alone could not do this:
   * a tucked thumb lying straight measured up to 152 degrees, overlapping
   * extended thumbs (157+), so the "1" of a six counted as two.
   */
  THUMB_OUT: 0.4,
  /** Thumb, sanity gate: a sharply bent thumb is never extended. Tucked-into-fist reads 79-118. */
  THUMB_EXTENDED_ANGLE: 120,
  /** Mean adjacent-fingertip gap below which the fingers read as a blade, as a multiple of palm span. */
  FINGERS_TOGETHER: 0.45,
};

/**
 * Decides which fingers are extended from joint angles rather than distance
 * from the wrist. Distance-from-wrist collapses as soon as a finger points at
 * the camera; angles in metric world space do not.
 */
function getFingerStates(world: Landmark[]) {
  const curls = CURL_TRIPLES.map(([a, b, c]) => angleAt(world[a], world[b], world[c]));

  // Unit vector along the knuckle line, index side -> pinky side. Projecting
  // the thumb tip onto it gives "across the palm" (positive) vs "sticking out
  // past the index" (negative), independent of handedness and hand rotation.
  const knuckles = sub(world[PINKY_MCP], world[INDEX_MCP]);
  const palmWidth = length3(knuckles) || 1;
  const thumbOut = -dot3(sub(world[THUMB[3]], world[INDEX_MCP]), knuckles) / (palmWidth * palmWidth);

  const fingers = curls.map((curl, i) =>
    i === 0
      ? curl > THRESHOLDS.THUMB_EXTENDED_ANGLE && thumbOut > THRESHOLDS.THUMB_OUT
      : curl > THRESHOLDS.EXTENDED_ANGLE
  );

  return { fingers, jointAngles: { curls, thumbOut } };
}

/**
 * How far apart neighbouring fingertips sit *across* the hand, as a multiple of
 * palm width. Measured in 3D and perpendicular to the finger direction, so it
 * ignores the natural length difference between fingers (the middle tip always
 * sits past the index tip) and does not collapse when the hand is edge-on.
 */
function fingerSpread(p: Landmark[]): number {
  const axis = sub(p[MIDDLE_TIP], p[MIDDLE_MCP]);
  const len = length3(axis) || 1;
  const dir = { x: axis.x / len, y: axis.y / len, z: axis.z / len };
  const across = (a: number, b: number) => {
    const v = sub(p[b], p[a]);
    const along = dot3(v, dir);
    return length3({ x: v.x - along * dir.x, y: v.y - along * dir.y, z: v.z - along * dir.z });
  };
  const gaps = [across(8, 12), across(12, 16), across(16, 20)];
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  return mean / (dist3(p[INDEX_MCP], p[PINKY_MCP]) || 1);
}

export function buildHandFeatures(
  screen: Landmark[],
  world: Landmark[] | undefined,
  handedness: "Left" | "Right",
  xScale: number
): HandFeatures {
  // World landmarks are strongly preferred: they are metric, isotropic and
  // perspective-free, so angles measured in them are directly comparable.
  // Falling back to screen space needs x un-squashed first, otherwise every
  // angle is distorted by the frame's aspect ratio.
  const usingWorld = !!world && world.length >= 21;
  const aspect = Math.abs(xScale);
  const solid = usingWorld
    ? world!
    : screen.map((p) => ({ x: p.x * aspect, y: p.y, z: p.z }));

  const { fingers, jointAngles } = getFingerStates(solid);
  const count = fingers.filter(Boolean).length;

  const palmSpan = dist2D(screen[INDEX_MCP], screen[PINKY_MCP], xScale) || 1e-6;

  // Separates a flat "minus" blade from a tilted open "five".
  const tipGap = fingerSpread(solid);

  const isFlat = fingers[1] && fingers[2] && fingers[3] && fingers[4];

  return {
    handedness,
    screen,
    world: solid,
    fingers,
    count,
    palmSpan,
    fingerAngle: lineAngle(screen[MIDDLE_MCP], screen[MIDDLE_TIP], xScale),
    palmAngle: lineAngle(screen[WRIST], screen[MIDDLE_MCP], xScale),
    indexAngle: lineAngle(screen[INDEX_MCP], screen[8], xScale),
    thumbAngle: signedAngle(screen[THUMB[1]], screen[THUMB[3]], xScale),
    tipGap,
    fingersTogether: tipGap < THRESHOLDS.FINGERS_TOGETHER,
    isFlat,
    jointAngles,
    usingWorld,
  };
}
