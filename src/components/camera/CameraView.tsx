"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import type { Hands, Results, LandmarkConnectionArray } from "@mediapipe/hands";
import { gestureEngine, GESTURE_NAMES, type GestureLabel } from "@/lib/gesture";

/** What the browser actually handed us, for the debug panel. */
export interface CameraInfo {
  label: string;
  /** Size of the frames MediaPipe receives. */
  width: number;
  height: number;
  /** Size the camera claims in its track settings; can differ for virtual cameras. */
  reported: string;
}

interface CameraViewProps {
  onLandmarksUpdate: (results: Results) => void;
  onCameraInfo?: (info: CameraInfo) => void;
  activeGesture?: GestureLabel;
}

interface MediaPipeGlobals {
  Hands: new (config: { locateFile: (file: string) => string }) => Hands;
  HAND_CONNECTIONS: LandmarkConnectionArray;
  drawConnectors: (
    ctx: CanvasRenderingContext2D,
    landmarks: unknown,
    connections: LandmarkConnectionArray,
    style: unknown
  ) => void;
  drawLandmarks: (
    ctx: CanvasRenderingContext2D,
    landmarks: unknown,
    style: unknown
  ) => void;
}

/**
 * MediaPipe's runtime (WASM + model files) is served from public/, copied there
 * from node_modules by scripts/copy-mediapipe.mjs. Self-hosting pins it to the
 * installed package version and removes the CDN as a single point of failure.
 */
const MEDIAPIPE_BASE = "/mediapipe/hands";

/** Turns a startup failure into something the user can act on. */
function describeInitError(err: unknown): string {
  const name = (err as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera permission was denied. Allow camera access for this site and reload.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No camera was found.";
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return "The camera is in use by another app. Close it and reload.";
  }
  const message = err instanceof Error ? err.message : String(err);
  return `Hand tracking failed to start: ${message}`;
}

export const CameraView: React.FC<CameraViewProps> = React.memo(({ onLandmarksUpdate, onCameraInfo, activeGesture = -1 }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [handCount, setHandCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const lastDrawTime = useRef(0);

  // Use refs for callbacks to avoid Effect restarts if parent re-renders
  const onLandmarksUpdateRef = useRef(onLandmarksUpdate);
  useEffect(() => {
    onLandmarksUpdateRef.current = onLandmarksUpdate;
  }, [onLandmarksUpdate]);
  const onCameraInfoRef = useRef(onCameraInfo);
  useEffect(() => {
    onCameraInfoRef.current = onCameraInfo;
  }, [onCameraInfo]);

  const drawResults = useCallback((results: Results) => {
    // Performance: Throttle drawing to ~20fps to save main thread
    const now = performance.now();
    if (now - lastDrawTime.current < 45) return;
    lastDrawTime.current = now;

    const canvas = canvasRef.current;
    const canvasCtx = canvas?.getContext("2d", { alpha: true, desynchronized: true } as CanvasRenderingContext2DSettings);
    if (!canvas || !canvasCtx) return;

    // Ensure canvas dimensions match video for accurate landmark mapping
    if (videoRef.current && (canvas.width !== videoRef.current.videoWidth || canvas.height !== videoRef.current.videoHeight)) {
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
    }

    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

    const mpGlobals = (globalThis as unknown as MediaPipeGlobals);
    if (!results.multiHandLandmarks || !mpGlobals.drawConnectors) return;

    const COLORS = { active: "#00ffcc", inactive: "#00f2ff44" };

    // Highlight exactly the fingers the classifier considers extended, rather
    // than recomputing it here with a different rule. When the overlay and the
    // recogniser disagree, the overlay is lying to you.
    const { hands } = gestureEngine.read(results);

    hands.forEach(({ screen: landmarks, fingers }) => {
      const palmConnections = [[5, 9], [9, 13], [13, 17], [0, 5], [0, 17]] as unknown as LandmarkConnectionArray;
      mpGlobals.drawConnectors(canvasCtx, landmarks, palmConnections, { color: COLORS.inactive, lineWidth: 2 });

      const fingerConnections = [
        [[0, 1], [1, 2], [2, 3], [3, 4]],
        [[0, 5], [5, 6], [6, 7], [7, 8]],
        [[0, 9], [9, 10], [10, 11], [11, 12]],
        [[0, 13], [13, 14], [14, 15], [15, 16]],
        [[0, 17], [17, 18], [18, 19], [19, 20]]
      ] as unknown as LandmarkConnectionArray[];

      fingerConnections.forEach((conn, i) => {
        mpGlobals.drawConnectors(canvasCtx, landmarks, conn, {
          color: fingers[i] ? COLORS.active : COLORS.inactive,
          lineWidth: fingers[i] ? 4 : 2,
        });
      });

      if (mpGlobals.drawLandmarks) {
        mpGlobals.drawLandmarks(canvasCtx, landmarks, {
          color: COLORS.active,
          lineWidth: 1,
          radius: (data: { index: number }) => [4, 8, 12, 16, 20].includes(data.index) ? 4 : 2
        });
      }
    });
  }, []);

  const drawResultsRef = useRef(drawResults);
  useEffect(() => {
    drawResultsRef.current = drawResults;
  }, [drawResults]);

  useEffect(() => {
    // Per-run cancellation flag. React StrictMode mounts, unmounts and remounts
    // in dev; a shared ref would read "mounted" again by the time the first
    // run's awaits resolved, so both runs would build a Hands graph, open a
    // camera stream and start a send loop against the same instance.
    let cancelled = false;
    let hands: Hands | null = null;
    let stream: MediaStream | null = null;
    let raf: number | null = null;

    const init = async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          "The camera is only available over https or on localhost. Open the app via http://localhost:3000."
        );
      }

      // Loaded by the <Script> tag in layout.tsx; the bundled module is only a fallback.
      let HandsClass = (window as unknown as { Hands?: typeof Hands }).Hands;
      if (!HandsClass) HandsClass = (await import("@mediapipe/hands")).Hands;
      if (!HandsClass) throw new Error("could not load the MediaPipe Hands library");
      if (cancelled) return;

      hands = new HandsClass({ locateFile: (file: string) => `${MEDIAPIPE_BASE}/${file}` });
      hands.setOptions({
        maxNumHands: 2,
        // Complexity 1 is the full landmark model. The lite model saves a few
        // milliseconds and costs noticeably more landmark jitter, which the
        // joint-angle rules are sensitive to.
        modelComplexity: 1,
        // Deliberately NOT using selfieMode. Landmarks stay in raw camera
        // space, the canvas is mirrored by CSS exactly like the video, and the
        // engine's `mirrored` flag handles the orientation maths. One place
        // owns the flip instead of three.
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.6,
      });
      hands.onResults((results: Results) => {
        if (cancelled) return;
        onLandmarksUpdateRef.current(results);
        drawResultsRef.current(results);
        setHandCount(results.multiHandLandmarks?.length ?? 0);
      });
      // Loads the WASM and model files now, so a missing asset fails here with
      // a visible error rather than inside the frame loop.
      await hands.initialize();
      if (cancelled) return;

      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
      });
      const video = videoRef.current;
      if (cancelled || !video) return;

      video.srcObject = stream;
      await video.play();
      if (cancelled) return;

      // x and y are normalized independently against the frame, so screen
      // angles are meaningless until x is rescaled by the aspect ratio. Taken
      // from the delivered frames, not the track settings: virtual and
      // workaround cameras can report one size and send another.
      const track = stream.getVideoTracks()[0];
      const syncFrameSize = () => {
        if (cancelled || !video.videoWidth || !video.videoHeight) return;
        gestureEngine.aspectRatio = video.videoWidth / video.videoHeight;
        const s = track?.getSettings();
        const info: CameraInfo = {
          label: track?.label || "unknown camera",
          width: video.videoWidth,
          height: video.videoHeight,
          reported: s?.width && s?.height ? `${s.width}x${s.height}` : "n/a",
        };
        console.log(`[Camera] ${info.label}: ${info.width}x${info.height} (reports ${info.reported})`);
        onCameraInfoRef.current?.(info);
      };
      syncFrameSize();
      video.addEventListener("resize", syncFrameSize);

      let lastProcessingTime = 0;
      let failures = 0;
      const processVideo = async () => {
        if (cancelled || !hands) return;
        const now = performance.now();
        if (video.readyState >= 2 && now - lastProcessingTime > 30) { // Max ~33fps
          lastProcessingTime = now;
          try {
            await hands.send({ image: video });
            failures = 0;
          } catch (err) {
            console.error("MediaPipe Error:", err);
            // One bad frame is noise; a run of them means the graph is dead.
            if (++failures >= 30) {
              setError(describeInitError(err));
              return;
            }
          }
        }
        if (!cancelled) raf = requestAnimationFrame(processVideo);
      };

      processVideo();
      setLoading(false);
    };

    init().catch((err) => {
      if (cancelled) return;
      console.error("[Camera] Init failed:", err);
      setError(describeInitError(err));
      setLoading(false);
    });

    return () => {
      cancelled = true;
      if (raf !== null) cancelAnimationFrame(raf);
      hands?.close().catch(() => {});
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []); // Only run once on mount

  return (
    <div className="relative w-full aspect-video rounded-3xl overflow-hidden neon-border-cyan bg-black shadow-2xl group">
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#05070a] z-40 p-8 text-center">
          <p className="text-red-400 font-mono text-sm tracking-wide max-w-md">{error}</p>
        </div>
      )}

      {loading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#05070a] z-30">
          <div className="w-16 h-16 border-2 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin mb-4" />
          <p className="text-cyan-500 font-mono text-sm tracking-widest uppercase animate-pulse">Starting camera...</p>
        </div>
      )}

      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover scale-x-[-1] opacity-100"
        playsInline
        muted
      />
      {/* Mirrored to match the video, so raw-space landmarks land on the right hand. */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full object-cover scale-x-[-1] pointer-events-none z-10"
        width={640}
        height={480}
      />

      <div className="absolute inset-0 pointer-events-none z-20 p-6 flex flex-col justify-between">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <div className="glass-dark px-3 py-1.5 rounded-lg border border-cyan-500/20 flex flex-col">
              <span className="text-[10px] text-cyan-500/50 uppercase font-bold tracking-tighter">Hands</span>
              <span className="text-sm font-mono text-cyan-400">{handCount}</span>
            </div>
            <div className="glass-dark px-3 py-1.5 rounded-lg border border-cyan-500/20 flex flex-col">
              <span className="text-[10px] text-cyan-500/50 uppercase font-bold tracking-tighter">Reading</span>
              <span className="text-sm font-mono text-cyan-400">{GESTURE_NAMES[activeGesture] ?? "None"}</span>
            </div>
          </div>

          <div className="glass-dark px-4 py-2 rounded-xl border border-cyan-500/30">
             <span className="text-xs font-mono text-cyan-400 uppercase tracking-widest flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${handCount > 0 ? "bg-cyan-500 animate-pulse" : "bg-white/20"}`} />
                {handCount > 0 ? "Tracking" : "Show a hand"}
             </span>
          </div>
        </div>
      </div>

      <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-cyan-500/40 rounded-tl-3xl z-20" />
      <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-cyan-500/40 rounded-tr-3xl z-20" />
      <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-cyan-500/40 rounded-bl-3xl z-20" />
      <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-cyan-500/40 rounded-br-3xl z-20" />
    </div>
  );
});

CameraView.displayName = "CameraView";
