"use client";

import React, { useEffect } from "react";
import { CameraView } from "@/components/camera/CameraView";
import { useGestureLogic } from "@/hooks/useGestureLogic";
import { CalculatorDisplay } from "./CalculatorDisplay";
import { HowToUse } from "@/components/ui/HowToUse";
import { gestureInference } from "@/lib/gestureInference";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, RefreshCcw, HelpCircle } from "lucide-react";


export const MainCalculator: React.FC = () => {
  const [showHowTo, setShowHowTo] = React.useState(false);
  const {
    operation,
    gestureProgress,
    processLandmarks,
    displayValue,
    equation,
    isSad,
    reset
  } = useGestureLogic();



  useEffect(() => {
    console.log("[v2.0 HUD] Dashboard initializing...");
    gestureInference.loadModel().then(() => {
      console.log("[v2.0 HUD] Model load sequence complete.");
    });
  }, []);

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
        
        <div className="flex items-center gap-4">
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
        <CameraView onLandmarksUpdate={processLandmarks} />
        
        {/* Progress Bar for Gesture Lock-in */}
        <div className="absolute top-[56.25%] left-0 w-full h-1 bg-cyan-500/5 z-30">
          <motion.div 
            className="h-full bg-cyan-400 shadow-[0_0_10px_rgba(0,242,255,1)]"
            initial={{ width: 0 }}
            animate={{ width: `${gestureProgress * 100}%` }}
            transition={{ ease: "linear", duration: 0.1 }}
          />
        </div>

        <CalculatorDisplay 
          displayValue={displayValue}
          equation={equation}
          operation={operation}
        />
      </div>

      {/* Popups & Overlays */}
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

    </div>
  );
};
