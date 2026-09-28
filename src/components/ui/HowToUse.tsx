"use client";

import React from "react";
import { motion } from "framer-motion";
import { HelpCircle, X } from "lucide-react";


interface HowToUseProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HowToUse: React.FC<HowToUseProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const gestures = [
    { label: "0 — 5", gesture: "Count on one hand", color: "text-cyan-400" },
    { label: "6 — 10", gesture: "Count on both hands", color: "text-cyan-400" },
    { label: "Plus  +", gesture: "Index fingers touching: one flat, one upright", color: "text-blue-400" },
    { label: "Multiply  ×", gesture: "Index fingers crossed as an X", color: "text-blue-400" },
    { label: "Minus  −", gesture: "Flat hand, sideways", color: "text-blue-400" },
    { label: "Divide  ÷", gesture: "Flat hand, tilted", color: "text-blue-400" },
    { label: "Equals  =", gesture: "Thumbs up", color: "text-cyan-400" },
    { label: "Backspace", gesture: "Thumbs down (undoes an operator too)", color: "text-orange-400" },
    { label: "Clear", gesture: "Press palms together", color: "text-pink-400" },
  ];


  return (
    <motion.div 
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="absolute top-24 left-6 z-40 w-72 glass-dark neon-border-cyan rounded-2xl p-6 shadow-2xl"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-widest">How to Use</h3>
        </div>
        <button 
          onClick={onClose}
          className="p-1 hover:bg-white/10 rounded-md transition-colors"
        >
          <X className="w-4 h-4 text-white/40" />
        </button>
      </div>

      <div className="space-y-3">
        {gestures.map((item) => (
          <div key={item.label} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
            <span className="text-xs text-white/50">{item.label}</span>
            <span className={`text-[10px] font-mono font-bold uppercase ${item.color} tracking-tighter`}>
              {item.gesture}
            </span>
          </div>
        ))}
      </div>


      <div className="mt-6 pt-4 border-t border-cyan-500/20">
        <p className="text-[9px] text-cyan-500/40 uppercase leading-relaxed font-medium">
          Hold a gesture until the bar fills to lock it in. For minus and divide, keep
          your fingers pressed together — a splayed hand reads as a digit. Keep your
          wrist in view and your hand not too close, or it may not be detected at all.
          To repeat a gesture, drop your hand out of frame between entries. Equals needs a
          full sum (e.g. 5 + 3). For 0-10, tuck your thumb in or stick it clearly out.
        </p>
      </div>
    </motion.div>
  );
};
