# Gesture-Based Visual Calculator

A high-performance, real-time Gesture-Based Visual Calculator powered by MediaPipe and ONNX Runtime Web. This application performs hand-tracking and gesture classification entirely client-side.

## Features

- **Real-time Hand Tracking**: Uses MediaPipe Hands to extract 21 (x, y, z) landmarks.
- **On-device Inference**: Gesture classification performed in the browser using ONNX Runtime Web.
- **Glassmorphism UI**: Beautiful, animated calculator display with Framer Motion.
- **Gesture State Machine**: Specialized stabilization logic (15+ frames) to prevent accidental inputs.

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **Package Manager**: Bun
- **AI/CV**: `@mediapipe/hands`, `onnxruntime-web`
- **Styling**: Tailwind CSS + shadcn/ui
- **Animation**: Framer Motion

## Installation & Setup

1. **Install dependencies**:
   ```bash
   bun install
   ```

2. **Run development server**:
   ```bash
   bun dev
   ```

3. **Build for production**:
   ```bash
   bun run build
   ```

This project is configured to load a gesture classification model from `/public/model/gesture_model.onnx`.

### 0. Download from Hugging Face
If you are hosting your model on Hugging Face, you can use the provided script to download it:
1. Open `scripts/fetch_model.ps1` and update the `$HF_MODEL_URL` with your Hugging Face model URL.
2. Run the following command:
   ```bash
   bun run model:fetch
   ```

### 1. Training the Model
Your model should accept an input tensor of shape `[1, 126]` (21 landmarks * 3 coordinates [x, y, z] * 2 hands) and output probabilities for the labels listed below.

### 2. The Gesture Map
The application maps the following model outputs to specific actions:

| Label | Action | Gesture |
|-------|--------|---------|
| 0-10  | Digit      | Hold 0-10 fingers |
| 11    | Plus (+)   | Model Defined |
| 12    | Minus (-)  | Model Defined |
| 13    | Multiply (*)| Model Defined (Index Cross) |
| 14    | Divide (/) | Model Defined (Tilted Palm) |
| 15    | Equals (=) | Thumbs Up |
| 16    | BKSP       | Thumbs Down |
| 17    | Error      | Middle Finger (Sad Face) |
| 18    | Reset      | Palms Together (Prayer) |

### 3. Deploying the Model
Simply replace or add your `.onnx` file at:
`public/model/gesture_model.onnx`

The `GestureInference` class in `src/lib/gestureInference.ts` will automatically attempt to load this file on initialization.

## The "Debounce" Logic

To prevent accidental "flickering" inputs (e.g., typing "333333" instantly), we use a **Confidence Counter**:
- A gesture is only registered if the model predicts the same label for **15 consecutive frames**.
- This stabilization ensures that the user's intent is clear before the calculator state is updated.
- Real-time feedback is provided via a progress bar in the UI.

## Performance Optimization

- **requestAnimationFrame**: The processing loop is decoupled from React renders to ensure 30+ FPS.
- **Canvas Rendering**: Landmarks and skeletons are drawn directly to a Canvas overlay for maximum efficiency.
- **Client-Side Only**: No data is sent to any server; all AI processing happens locally in your browser.
