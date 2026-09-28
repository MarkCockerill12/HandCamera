"use client";

import React from "react";
import { CameraView, type CameraInfo } from "@/components/camera/CameraView";
import { useGestureLogic } from "@/hooks/useGestureLogic";
import { CalculatorDisplay } from "./CalculatorDisplay";
import { HowToUse } from "@/components/ui/HowToUse";
import { GESTURE_NAMES, THRESHOLDS } from "@/lib/gesture";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, RefreshCcw, HelpCircle, Clipboard, Bug } from "lucide-react";


export const MainCalculator: React.FC = () => {
  const [showHowTo, setShowHowTo] = React.useState(false);
  const [cameraInfo, setCameraInfo] = React.useState<CameraInfo | null>(null);
  const {
    operation,
    activeGesture,
    gestureProgress,
    processLandmarks,
    displayValue,
    equation,
    isSad,
    commitFlash,
    reset,

    // Test mode
    isTestMode,
    testIndex,
    isAwaitingFeedback,
    lastDetectedDuringTest,
    toggleTestMode,
    submitTestFeedback,
    GESTURES_TO_TEST,
    liveSnapshot,
    committedSnapshot,
    testReport,
    debugEnabled,
    debugInfo,
    toggleDebug,
  } = useGestureLogic();

  // The commit flash hides itself shortly after each commit.
  const [flashVisible, setFlashVisible] = React.useState(false);
  React.useEffect(() => {
    if (!commitFlash) return;
    setFlashVisible(true);
    const timer = setTimeout(() => setFlashVisible(false), commitFlash.note ? 2200 : 1200);
    return () => clearTimeout(timer);
  }, [commitFlash]);

  const copyDebugData = () => {
    const data = JSON.stringify(testReport, null, 2);
    navigator.clipboard.writeText(data).then(() => {
      alert("Debug data copied to clipboard!");
    });
  };

  return (
    <div className="relative w-full max-w-5xl mx-auto">
      {/* Top Navigation / Controls */}
      <div className="flex justify-between items-center mb-8 px-4">
        <div className="flex items-center gap-6">
          <h1 className="text-2xl font-black tracking-tighter text-cyan-400 neon-glow-cyan uppercase">
            Hand Calculator
          </h1>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
            <span className="text-[10px] text-cyan-500/50 uppercase font-bold tracking-[0.2em]">Live Tracking</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleDebug}
            className={`p-2 rounded-full glass-dark border transition-all ${debugEnabled ? 'border-emerald-500 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/10'}`}
            title="Toggle live gesture diagnostics"
          >
            <Bug className="w-5 h-5" />
          </button>
          <button
            onClick={toggleTestMode}
            className={`p-2 rounded-full glass-dark border transition-all ${isTestMode ? 'border-amber-500 text-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.3)]' : 'border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/10'}`}
            title="Toggle Debug Test Mode"
          >
            <RefreshCcw className={`w-5 h-5 ${isTestMode ? 'animate-spin' : ''}`} />
          </button>
          <button 
            onClick={() => setShowHowTo(!showHowTo)}
            className="p-2 rounded-full glass-dark border border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/10 transition-all"
          >
            <HelpCircle className="w-5 h-5" />
          </button>
          <button 
            onClick={reset}
            className="p-2 rounded-full glass-dark border border-white/10 text-white/40 hover:text-white transition-all"
          >
            <RefreshCcw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Integrated Dashboard */}
      <div className="relative flex flex-col rounded-[2.5rem] overflow-hidden glass-dark neon-border-cyan shadow-[0_0_50px_rgba(0,242,255,0.1)]">
        <CameraView onLandmarksUpdate={processLandmarks} onCameraInfo={setCameraInfo} activeGesture={activeGesture} />
        
        {/* Progress Bar for Gesture Lock-in */}
        <div className="absolute top-[56.25%] left-0 w-full h-1 bg-cyan-500/5 z-30">
          <motion.div 
            className="h-full bg-cyan-400 shadow-[0_0_10px_rgba(0,242,255,1)]"
            initial={{ width: 0 }}
            animate={{ width: `${gestureProgress * 100}%` }}
            transition={{ ease: "linear", duration: 0.1 }}
          />
        </div>

        {/* Confirms every entered gesture, and says why when it had no effect. */}
        <AnimatePresence mode="wait">
          {flashVisible && commitFlash && (
            <motion.div
              key={commitFlash.at}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute left-1/2 -translate-x-1/2 top-[calc(56.25%-3.5rem)] z-30 glass-dark px-4 py-2 rounded-xl border border-cyan-500/40 font-mono text-sm text-cyan-300 whitespace-nowrap"
            >
              Entered {GESTURE_NAMES[commitFlash.label] ?? commitFlash.label}
              {commitFlash.note && <span className="text-amber-400"> &middot; {commitFlash.note}</span>}
            </motion.div>
          )}
        </AnimatePresence>

        <CalculatorDisplay 
          displayValue={displayValue}
          equation={equation}
          operation={operation}
        />
      </div>

      {/* Rude gesture (17). Cleared by the prayer reset or any other commit. */}
      <AnimatePresence>
        {isSad && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#05070a] backdrop-blur-3xl"
          >
            <div className="relative mb-12">
               <motion.div 
                  animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
                  transition={{ duration: 0.5, repeat: Infinity }}
                  className="w-48 h-48 bg-red-500/20 rounded-full flex items-center justify-center border-4 border-red-500/50 shadow-[0_0_50px_rgba(255,45,85,0.3)]"
               >
                  <span className="text-8xl">😵</span>
               </motion.div>
               <AlertTriangle className="absolute -top-4 -right-4 w-16 h-16 text-red-500 animate-pulse" />
            </div>

            <div className="text-center space-y-4 px-6">
              <h2 className="text-7xl font-black text-red-500 tracking-tighter uppercase italic neon-glow-pink">
                 Gesture_Rejected
              </h2>
              <p className="text-red-500/60 font-mono text-sm uppercase tracking-widest">
                Input detected: <span className="text-red-400 font-bold">Insolent_Finger_v3.1</span>
              </p>
              <p className="max-w-md mx-auto text-red-500/40 text-[10px] leading-relaxed uppercase">
                System emotional core has been compromised. All calculations suspended until mutual respect is restored via the <span className="text-cyan-500 font-bold">Prayer_Protocol</span>.
              </p>
            </div>

            <div className="mt-12 flex flex-col items-center gap-6">
               <div className="flex gap-8">
                  <div className="glass-dark border border-red-500/30 p-4 rounded-lg">
                     <span className="block text-[8px] text-red-500/50 uppercase mb-1">Violation Log</span>
                     <span className="text-[10px] text-red-400 font-mono">ERR_USER_UNFRIENDLY</span>
                  </div>
                  <div className="glass-dark border border-cyan-500/30 p-4 rounded-lg">
                     <span className="block text-[8px] text-cyan-500/50 uppercase mb-1">AI Response</span>
                     <span className="text-[10px] text-cyan-400 font-mono">STATUS: AWAITING_APOLOGY</span>
                  </div>
               </div>
               
               <motion.div 
                  animate={{ opacity: [0.2, 1, 0.2] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="text-[10px] text-cyan-500 font-bold uppercase tracking-[0.4em]"
               >
                  Clasp hands to initiate Prayer_Protocol
               </motion.div>
            </div>

            <div className="absolute bottom-10 text-[10px] text-red-500/20 uppercase tracking-[0.5em] font-bold">
               Phalangeal_Insult_Mitigation_Active
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showHowTo && (
          <HowToUse isOpen={showHowTo} onClose={() => setShowHowTo(false)} />
        )}
      </AnimatePresence>

      {debugEnabled && (
        <div className="mt-4 glass-dark border border-emerald-500/30 rounded-2xl p-4 font-mono text-[11px] text-white/60 leading-relaxed overflow-x-auto">
          <div className="text-emerald-400 uppercase tracking-widest text-[9px] font-bold mb-2">
            Live diagnostics
          </div>
          {cameraInfo && (
            <div className="text-white/40 mb-2">
              camera <span className="text-cyan-400">{cameraInfo.label}</span> &middot; frames{" "}
              <span className="text-cyan-400">{cameraInfo.width}x{cameraInfo.height}</span> &middot; reports {cameraInfo.reported}
            </div>
          )}
          {!debugInfo ? (
            <div className="text-white/30">No hand detected.</div>
          ) : (
            <>
              <div className="flex flex-wrap gap-x-6 gap-y-1 mb-3">
                <span>fps <span className={debugInfo.fps < 12 ? "text-red-400" : "text-emerald-400"}>{debugInfo.fps}</span></span>
                <span>hands <span className="text-cyan-400">{debugInfo.handCount}</span></span>
                <span>raw <span className="text-amber-400">{GESTURE_NAMES[debugInfo.rawLabel] ?? debugInfo.rawLabel}</span></span>
                <span>voted <span className={debugInfo.smoothedLabel === -1 ? "text-red-400" : "text-emerald-400"}>
                  {debugInfo.smoothedLabel === -1 ? "ambiguous" : (GESTURE_NAMES[debugInfo.smoothedLabel] ?? debugInfo.smoothedLabel)}
                </span></span>
                <span>hold <span className="text-cyan-400">{Math.round(debugInfo.progress * 100)}%</span></span>
              </div>
              <div className="text-white/40 mb-2">rule: <span className="text-cyan-400">{debugInfo.snapshot.reason}</span></div>
              <div className="flex flex-wrap gap-3">
                {debugInfo.snapshot.hands.map((h, i) => (
                  <div key={i} className="bg-black/40 rounded-lg px-3 py-2 border border-white/5">
                    <div className="text-emerald-500/70">
                      {h.handedness} &middot; {h.count} extended
                      {!h.usingWorld && <span className="text-red-400"> &middot; NO WORLD LANDMARKS</span>}
                    </div>
                    <div>thumb-index-middle-ring-pinky <span className="text-amber-400">{h.fingers}</span></div>
                    <div>curl <span className="text-white/80">{h.curls.join("  ")}</span> <span className="text-white/25">(extended: thumb &gt;{THRESHOLDS.THUMB_EXTENDED_ANGLE}, others &gt;{THRESHOLDS.EXTENDED_ANGLE})</span></div>
                    <div>thumb out <span className="text-white/80">{h.thumbOut}</span> <span className="text-white/25">(&gt;{THRESHOLDS.THUMB_OUT})</span></div>
                    <div>angle {h.fingerAngle}&deg; &middot; {h.together ? "together" : "spread"} (gap {h.tipGap}, &lt;{THRESHOLDS.FINGERS_TOGETHER}) &middot; {h.flat ? "flat" : "not flat"}</div>
                    <div>index {h.indexAngle}&deg; &middot; thumb {h.thumbAngle}&deg;</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <AnimatePresence>
        {isTestMode && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 z-40 w-full max-w-lg px-6"
          >
            <div className="glass-dark border border-amber-500/30 rounded-3xl p-6 shadow-2xl backdrop-blur-xl">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <span className="text-[10px] text-amber-500/50 uppercase font-black tracking-widest block mb-1">
                    Debug_Sequence_{testIndex + 1}/{GESTURES_TO_TEST.length}
                  </span>
                  <h3 className="text-2xl font-black text-white tracking-tight uppercase italic">
                    {GESTURES_TO_TEST[testIndex].name}
                  </h3>
                </div>
                <button 
                  onClick={toggleTestMode}
                  className="text-white/20 hover:text-white/60 transition-colors"
                >
                  EXIT TEST
                </button>
              </div>

              {testReport.length > 0 && (
                <button 
                  onClick={copyDebugData}
                  className="mb-4 w-full py-2 bg-white/10 hover:bg-white/20 text-white/60 text-[10px] uppercase font-bold rounded-lg border border-white/5 flex items-center justify-center gap-2 transition-all"
                >
                  <Clipboard className="w-3 h-3" />
                  Copy Current Test Report
                </button>
              )}

              <div className="bg-white/5 rounded-2xl p-6 border border-white/5 mb-6 text-center italic text-white/60 text-sm">
                &quot;Please perform the gesture above clearly in front of the camera.&quot;
              </div>

              {isAwaitingFeedback && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="space-y-6"
                >
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-[10px] text-cyan-500 font-bold uppercase tracking-widest">Inference Result</span>
                    <div className="text-4xl font-black text-cyan-400 neon-glow-cyan uppercase italic">
                      {GESTURE_NAMES[lastDetectedDuringTest] ?? "Unknown"}
                    </div>
                    {(() => {
                      const snap = committedSnapshot || liveSnapshot;
                      if (!snap) return null;
                      return (
                        <div className="flex flex-col items-center gap-2 mt-2 w-full">
                          <span className="text-[8px] text-white/30 uppercase tracking-widest">
                            Rule: <span className="text-cyan-500">{snap.reason}</span>
                          </span>
                          <div className="flex flex-wrap justify-center gap-2 w-full">
                            {snap.hands.map((h, i) => (
                              <div key={i} className="bg-black/40 rounded-lg px-3 py-2 border border-white/5 font-mono text-[9px] text-white/50 leading-relaxed">
                                <div className="text-cyan-500/70">{h.handedness}</div>
                                <div>fingers <span className="text-amber-400">{h.fingers}</span> ({h.count})</div>
                                <div>angle {h.fingerAngle}&deg; {h.together ? "together" : "spread"}</div>
                                <div>curl {h.curls.join(" ")}</div>
                                <div>thumb out {h.thumbOut}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                    <span className="text-white/40 text-[10px] mt-2">Is this detection accurate?</span>
                  </div>

                  <div className="flex gap-4">
                    <button 
                      onClick={() => submitTestFeedback(true)}
                      className="flex-1 py-4 bg-cyan-500 text-black font-black uppercase tracking-tighter rounded-xl hover:bg-cyan-400 transition-all active:scale-95 shadow-[0_0_20px_rgba(0,255,204,0.3)]"
                    >
                      Correct [YES]
                    </button>
                    <button 
                      onClick={() => submitTestFeedback(false)}
                      className="flex-1 py-4 bg-red-500/20 border border-red-500/50 text-red-500 font-black uppercase tracking-tighter rounded-xl hover:bg-red-500/30 transition-all active:scale-95"
                    >
                      Incorrect [NO]
                    </button>
                  </div>
                </motion.div>
              )}

              {!isAwaitingFeedback && (
                <div className="flex items-center justify-center py-8">
                  <div className="flex gap-4">
                     {[1, 2, 3].map(i => (
                       <motion.div 
                        key={i}
                        animate={{ scale: [1, 1.5, 1], opacity: [0.2, 1, 0.2] }}
                        transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                        className="w-2 h-2 rounded-full bg-amber-500"
                       />
                     ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
