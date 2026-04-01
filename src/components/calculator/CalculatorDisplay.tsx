"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";

interface CalculatorDisplayProps {
  displayValue: string;
  equation: string;
  operation: string | null;
}

export const CalculatorDisplay: React.FC<CalculatorDisplayProps> = ({ 
  displayValue, 
  equation,
  operation 
}) => {
  return (
    <div className="relative w-full px-8 py-6 glass-dark border-t border-cyan-500/20 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
      <div className="relative z-10 flex flex-col items-center justify-center gap-1">
        <div className="h-6 w-full flex justify-center items-center">
          <AnimatePresence mode="wait">
            <motion.p 
              key={equation}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="text-cyan-500/50 text-base font-mono tracking-[0.3em] uppercase"
            >
              {equation || "System Ready"} {operation && <span className="text-cyan-400 opacity-100">[{operation}]</span>}
            </motion.p>
          </AnimatePresence>
        </div>

        <div className="w-full flex justify-center items-center h-20">
          <AnimatePresence mode="wait">
            <motion.h2 
              key={displayValue}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.1, opacity: 0 }}
              className="text-6xl md:text-7xl font-black text-cyan-400 tracking-tighter neon-glow-cyan drop-shadow-[0_0_15px_rgba(0,242,255,0.5)]"
            >
              {displayValue}
            </motion.h2>
          </AnimatePresence>
        </div>
        
        {/* Animated scanning line */}
        <div className="absolute bottom-0 left-0 w-full h-px bg-cyan-500/20 overflow-hidden">
          <motion.div 
            animate={{ x: ["-100%", "100%"] }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            className="w-1/3 h-full bg-linear-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_10px_rgba(0,242,255,1)]"
          />
        </div>
      </div>
    </div>

  );
};
