"use client";

import React, { useRef, useEffect, useState } from "react";
import type { Hands, Results, LandmarkConnectionArray } from "@mediapipe/hands";


interface CameraViewProps {
  onLandmarksUpdate: (results: Results) => void;
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




export const CameraView: React.FC<CameraViewProps> = ({ onLandmarksUpdate }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);




  const drawResults = (results: Results) => {
    const canvas = canvasRef.current;
    const canvasCtx = canvas?.getContext("2d");
    if (!canvas || !canvasCtx) return;

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
    
    const mpGlobals = (globalThis as unknown as MediaPipeGlobals);
    if (!results.multiHandLandmarks || !mpGlobals.drawConnectors) {
      canvasCtx.restore();
      return;
    }

    const COLORS = { active: "#00ffcc", inactive: "#00f2ff44" };

    results.multiHandLandmarks.forEach((landmarks) => {
      const wrist = landmarks[0];
      
      // Extension Status Logic
      const fingerTips = [8, 12, 16, 20];
      const fingerPIPs = [6, 10, 14, 18];
      const fingerExtensions = fingerTips.map((tipIdx, i) => {
        const dTip = Math.hypot(landmarks[tipIdx].x - wrist.x, landmarks[tipIdx].y - wrist.y);
        const dPip = Math.hypot(landmarks[fingerPIPs[i]].x - wrist.x, landmarks[fingerPIPs[i]].y - wrist.y);
        return dTip > dPip;
      });

      const thumbTip = landmarks[4];
      const indexBase = landmarks[5];
      const dThumb = Math.hypot(thumbTip.x - indexBase.x, thumbTip.y - indexBase.y);
      const wristScale = Math.hypot(wrist.x - indexBase.x, wrist.y - indexBase.y);
      const thumbExtended = dThumb > wristScale * 0.8;
      
      const extensions = [thumbExtended, ...fingerExtensions];

      // Draw Palm
      const palmConnections = [[5, 9], [9, 13], [13, 17], [0, 5], [0, 17]] as unknown as LandmarkConnectionArray;
      mpGlobals.drawConnectors(canvasCtx, landmarks, palmConnections, {
        color: COLORS.inactive,
        lineWidth: 2,
      });

      // Draw Fingers
      const fingerConnections = [
        [[0, 1], [1, 2], [2, 3], [3, 4]], // Thumb
        [[0, 5], [5, 6], [6, 7], [7, 8]], // Index
        [[0, 9], [9, 10], [10, 11], [11, 12]], // Middle
        [[0, 13], [13, 14], [14, 15], [15, 16]], // Ring
        [[0, 17], [17, 18], [18, 19], [19, 20]]  // Pinky
      ] as unknown as LandmarkConnectionArray[];

      fingerConnections.forEach((conn, i) => {
        mpGlobals.drawConnectors(canvasCtx, landmarks, conn, {
          color: extensions[i] ? COLORS.active : COLORS.inactive,
          lineWidth: extensions[i] ? 4 : 2,
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
    
    canvasCtx.restore();
  };

  useEffect(() => {
    let hands: Hands | null = null;
    let rafId: number;

    const initMediaPipe = async () => {
      console.log("[v3.5 MediaPipe] Initializing Hands solution via dynamic import...");
      try {
        // Direct import instead of global polling
        const { Hands } = await import("@mediapipe/hands");

        const h = new Hands({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
        });

        h.setOptions({
          maxNumHands: 2,
          modelComplexity: 1,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });


        h.onResults((results: Results) => {
          onLandmarksUpdate(results);
          drawResults(results);
        });

        hands = h;


        if (videoRef.current) {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480 },
          });
          videoRef.current.srcObject = stream;
          videoRef.current.play();

          const processVideo = async () => {
            if (videoRef.current && hands) {
              await hands.send({ image: videoRef.current });
            }
            rafId = requestAnimationFrame(processVideo);
          };
          
          processVideo();
          setLoading(false);
        }
      } catch (error) {
        console.error("Error initializing MediaPipe Hands:", error);
        // Ensure we stop the spinner even on error so user doesn't hang
        setLoading(false);
      }
    };

    initMediaPipe();

    return () => {
      if (hands) {
        hands.close();
      }
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [onLandmarksUpdate]);

  return (
    <div className="relative w-full aspect-video rounded-3xl overflow-hidden neon-border-cyan bg-black shadow-2xl group">
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#05070a] z-30">
          <div className="w-16 h-16 border-2 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin mb-4" />
          <p className="text-cyan-500 font-mono text-sm tracking-widest uppercase animate-pulse">Initializing Neural Core...</p>
        </div>
      )}
      
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover scale-x-[-1] opacity-100"
        playsInline
        muted
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full object-cover scale-x-[-1] pointer-events-none z-10"
        width={640}
        height={480}
      />

      {/* Futuristic Overlays */}
      <div className="absolute inset-0 pointer-events-none z-20 p-6 flex flex-col justify-between">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <div className="glass-dark px-3 py-1.5 rounded-lg border border-cyan-500/20 flex flex-col">
              <span className="text-[10px] text-cyan-500/50 uppercase font-bold tracking-tighter">Precision</span>
              <span className="text-sm font-mono text-cyan-400">99.8%</span>
            </div>
            <div className="glass-dark px-3 py-1.5 rounded-lg border border-cyan-500/20 flex flex-col">
              <span className="text-[10px] text-cyan-500/50 uppercase font-bold tracking-tighter">Latency</span>
              <span className="text-sm font-mono text-cyan-400">14ms</span>
            </div>
          </div>

          <div className="glass-dark px-4 py-2 rounded-xl border border-cyan-500/30">
             <span className="text-xs font-mono text-cyan-400 uppercase tracking-widest flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
                {" "}Active Input: Numeric
             </span>
          </div>

        </div>

        <div className="flex justify-between items-end">
          <div className="px-4 py-2 rounded-full glass-dark border border-white/5 text-[10px] text-cyan-500/50 uppercase tracking-[0.2em] font-bold">
            Live Tracking System v2.0
          </div>
        </div>
      </div>

      {/* Decorative corner lines */}
      <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-cyan-500/40 rounded-tl-3xl z-20" />
      <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-cyan-500/40 rounded-tr-3xl z-20" />
      <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-cyan-500/40 rounded-bl-3xl z-20" />
      <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-cyan-500/40 rounded-br-3xl z-20" />
    </div>
  );

};
