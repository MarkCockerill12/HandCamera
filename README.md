# Gesture-Based Visual Calculator

A real-time calculator you operate with hand gestures. Hand tracking runs entirely
client-side via MediaPipe; recognition is deterministic geometry, with no model to download
and nothing sent to a server.

## Features

- **Real-time hand tracking**: MediaPipe Hands, 21 landmarks per hand, up to two hands.
- **Geometric recognition**: joint-angle finger states plus screen-orientation rules — fully
  deterministic and debuggable, no training required.
- **Glassmorphism UI**: animated calculator display with Framer Motion.
- **Hold-to-commit**: a gesture must be held steadily before it registers, so the calculator
  never fills with accidental input.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Package Manager**: Bun
- **CV**: `@mediapipe/hands`
- **Styling**: Tailwind CSS + shadcn/ui
- **Animation**: Framer Motion

## Setup

```bash
bun install
bun dev          # development
bun run build    # production
```

Grant camera access when prompted. There is no model file or extra download step.

## Gesture Map

| Action | Gesture |
|---|---|
| Digits 0–5 | Count on one hand |
| Digits 6–10 | Count across both hands |
| Plus `+` | Two index fingers **touching**, one horizontal and one vertical |
| Multiply `×` | Two index fingers **crossed** as an X (any crossing that is not a plus) |
| Minus `−` | One flat hand, fingers together, held sideways |
| Divide `÷` | One flat hand, fingers together, tilted diagonally |
| Equals `=` | Thumbs up (needs a full sum, e.g. `5 + 3`) |
| Backspace | Thumbs down; with no digits pending it takes back the operator |
| Clear | Press both palms together |

Fingers **together** is what separates minus and divide from a tilted "four" or "five" — a
splayed hand is always read as a digit. The index fingers must actually touch for plus and
multiply, so two separate pointing hands still count as 1 + 1 = 2. A thumb counts as a finger
only when it sticks out past the index knuckle; one pressed flat against the side of the hand
does not. Every entered gesture is confirmed on screen, with a note when it had no effect.

## How Recognition Works

`src/lib/gesture/` is the whole engine, and it leans on the fact that MediaPipe returns two
different landmark sets per frame:

- **`multiHandWorldLandmarks`** — metric 3D coordinates centred on the hand, with perspective
  removed. Used to decide which fingers are extended, via the interior angles at each finger's
  PIP and MCP joints. Because these are angles in a perspective-free space, a finger pointing
  straight at the camera is still measured correctly.
- **`multiHandLandmarks`** — normalized image coordinates. Used only for on-screen
  orientation (is this blade horizontal or diagonal?). `x` is rescaled by `xScale` first,
  whose magnitude is the video aspect ratio (MediaPipe normalizes `x` and `y` against
  different dimensions) and whose sign is negative because the preview is mirrored. That
  single sign is the only place the mirror is handled in the maths, so a blade that looks
  like "/" on screen measures as "/". Distances are unaffected — the term gets squared.

MediaPipe's `selfieMode` is deliberately **not** used. The canvas is CSS-mirrored to match
the video, landmarks stay in raw camera space, and `gestureEngine.mirrored` owns the flip.
One place decides, instead of three that have to agree.

`classifier.ts` then runs a rule ladder, most-specific first. Every rule that could shadow a
digit carries a precondition strict enough that it cannot fire on an ordinary counting pose,
and anything unmatched falls through to the finger count.

| File | Responsibility |
|---|---|
| `types.ts` | Shared types and gesture-name maps |
| `math.ts` | Vector helpers, joint angles, screen line-angles |
| `handFeatures.ts` | Per-hand feature extraction and **all tuning thresholds** |
| `classifier.ts` | The rule ladder |
| `index.ts` | `gestureEngine` singleton and hand ordering |

### Tuning

If a gesture misreads, adjust the `THRESHOLDS` constants in `handFeatures.ts` rather than
adding special cases to the classifier. The in-app test mode (the refresh icon in the header)
walks through every gesture and prints the live per-hand joint angles, finger states, and
which rule fired.

`classify()` and `buildHandFeatures()` are pure functions with no MediaPipe or DOM
dependency, so they can be exercised directly from a script.

## Timing

- A 3-of-5 frame majority vote suppresses single-frame noise.
- The winning gesture must then be held for 450 ms to commit.
- Holding a gesture enters it once. To enter the same thing again (e.g. "44"), drop your
  hand out of frame or change gesture, then show it again (850 ms hold for the repeat).
- A 700 ms cooldown follows each commit.

MediaPipe's runtime is served from `public/mediapipe/`, copied out of `node_modules` by
`scripts/copy-mediapipe.mjs` before every `dev` and `build`. The app does not use a CDN.

Timings are in milliseconds rather than frames so the feel is the same on a fast laptop and
a throttled phone.

## Performance

- **requestAnimationFrame**: the processing loop is decoupled from React renders.
- **Canvas overlay**: the skeleton is drawn straight to canvas, throttled to ~20fps, and
  highlights exactly the fingers the classifier considers extended.
- **Client-side only**: no data leaves your browser.
