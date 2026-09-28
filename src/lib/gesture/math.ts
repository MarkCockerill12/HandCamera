import type { Landmark } from "./types";

const RAD_TO_DEG = 180 / Math.PI;

export function sub(a: Landmark, b: Landmark): Landmark {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function length3(v: Landmark): number {
  return Math.hypot(v.x, v.y, v.z);
}

export function dot3(a: Landmark, b: Landmark): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function dist3(a: Landmark, b: Landmark): number {
  return length3(sub(a, b));
}

/** Angle in degrees between two vectors. */
export function angleBetween(a: Landmark, b: Landmark): number {
  const denom = length3(a) * length3(b);
  if (denom === 0) return 0;
  const cos = Math.min(1, Math.max(-1, dot3(a, b) / denom));
  return Math.acos(cos) * RAD_TO_DEG;
}

/**
 * Interior angle at joint `b` of the chain a-b-c, in degrees.
 * 180 means perfectly straight; smaller means more bent.
 */
export function angleAt(a: Landmark, b: Landmark, c: Landmark): number {
  return angleBetween(sub(a, b), sub(c, b));
}

/**
 * `xScale` converts MediaPipe's normalized x into the same units as y, and
 * carries the preview's handedness with it.
 *
 * Its magnitude is the video aspect ratio, because x is normalized against the
 * frame width and y against the height. Its *sign* is negative when the preview
 * is mirrored, which flips angles into the orientation the user actually sees —
 * so a blade that looks like "/" on screen measures as "/" here. Distances are
 * unaffected, since the term is squared.
 */

/** Aspect-corrected 2D distance in screen space. */
export function dist2D(a: Landmark, b: Landmark, xScale: number): number {
  return Math.hypot((a.x - b.x) * xScale, a.y - b.y);
}

/**
 * Shortest aspect-corrected screen distance between segments p1-p2 and q1-q2;
 * 0 when they intersect.
 */
export function segmentDistance(p1: Landmark, p2: Landmark, q1: Landmark, q2: Landmark, xScale: number): number {
  const s = Math.abs(xScale);
  const P1 = { x: p1.x * s, y: p1.y }, P2 = { x: p2.x * s, y: p2.y };
  const Q1 = { x: q1.x * s, y: q1.y }, Q2 = { x: q2.x * s, y: q2.y };
  type P = { x: number; y: number };
  const cross = (a: P, b: P, c: P) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  if (cross(P1, P2, Q1) * cross(P1, P2, Q2) < 0 && cross(Q1, Q2, P1) * cross(Q1, Q2, P2) < 0) return 0;
  const toSegment = (a: P, b: P, c: P) => {
    const abx = b.x - a.x, aby = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((c.x - a.x) * abx + (c.y - a.y) * aby) / (abx * abx + aby * aby || 1)));
    return Math.hypot(a.x + t * abx - c.x, a.y + t * aby - c.y);
  };
  return Math.min(toSegment(P1, P2, Q1), toSegment(P1, P2, Q2), toSegment(Q1, Q2, P1), toSegment(Q1, Q2, P2));
}

/**
 * Direction from `from` to `to` as a *line* angle in [0, 180).
 *
 * 0 = horizontal, 90 = vertical. Because a hand blade has no head or tail, the
 * angle is folded modulo 180 so pointing left and pointing right are the same.
 * Image y grows downward, so it is negated to make "up" the positive direction.
 */
export function lineAngle(from: Landmark, to: Landmark, xScale: number): number {
  const dx = (to.x - from.x) * xScale;
  const dy = -(to.y - from.y);
  const deg = Math.atan2(dy, dx) * RAD_TO_DEG;
  return ((deg % 180) + 180) % 180;
}

/**
 * Signed direction from `from` to `to` in (-180, 180], up = +90.
 * Used where the head/tail distinction matters, e.g. thumbs up vs down.
 */
export function signedAngle(from: Landmark, to: Landmark, xScale: number): number {
  const dx = (to.x - from.x) * xScale;
  const dy = -(to.y - from.y);
  return Math.atan2(dy, dx) * RAD_TO_DEG;
}
