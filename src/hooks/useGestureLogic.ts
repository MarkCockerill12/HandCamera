"use client";

import { useState, useCallback, useRef, useEffect } from "react";

import type { Results } from "@mediapipe/hands";
import { gestureInference, GestureLabel } from "@/lib/gestureInference";

export const useGestureLogic = () => {
  const [currentInput, setCurrentInput] = useState<string>("");
  const [previousValue, setPreviousValue] = useState<string | null>(null);
  const [operation, setOperation] = useState<string | null>(null);
  const [result, setResult] = useState<number | null>(null);
  
  const [isSad, setIsSad] = useState(false);
  const [activeGesture, setActiveGesture] = useState<GestureLabel>(-1);

  const [gestureProgress, setGestureProgress] = useState(0); 
  
  const consecutiveFrames = useRef<number>(0);
  const lastLabel = useRef<GestureLabel>(-1);
  const STABILIZATION_FRAMES = 15;

  const calculate = (prev: string | null, curr: string, op: string | null) => {
    if (!prev || !curr || !op) return null;
    const a = Number.parseFloat(prev);
    const b = Number.parseFloat(curr);
    
    switch (op) {
      case "+": return a + b;
      case "-": return a - b;
      case "*": return a * b;
      case "/": return b !== 0 ? a / b : null;
      default: return null;
    }
  };

  const performOperation = useCallback((op: "+" | "-" | "*" | "/") => {
    if (currentInput) {
      setPreviousValue(currentInput);
      setOperation(op);
      setCurrentInput("");
    }
  }, [currentInput]);

  const performCalculation = useCallback(() => {
    if (previousValue && currentInput && operation) {
      const res = calculate(previousValue, currentInput, operation);
      if (res !== null) {
        setResult(res);
        setCurrentInput(res.toString());
        setPreviousValue(null);
        setOperation(null);
      }
    }
  }, [previousValue, currentInput, operation]);

  const reset = useCallback(() => {
    setCurrentInput("");
    setPreviousValue(null);
    setOperation(null);
    setResult(null);
    setIsSad(false);

    consecutiveFrames.current = 0;
    lastLabel.current = -1;
    setGestureProgress(0);
    setActiveGesture(-1);
  }, []);

  const handleGestureCommit = useCallback((label: GestureLabel) => {
    if (isSad && label !== 16) return; // Only allow Prayer Protocol (16) to reset

    switch (true) {
      case (label >= 0 && label <= 10):
        setCurrentInput((prev) => prev + label.toString());
        setResult(null);
        break;
      case (label === 11): // Plus
        performOperation("+");
        break;
      case (label === 12): // Minus
        performOperation("-");
        break;
      case (label === 13): // Multiply
        performOperation("*");
        break;
      case (label === 14): // Divide
        performOperation("/");
        break;
      case (label === 15): // Equals
        performCalculation();
        break;
      case (label === 16): // Backspace
        setCurrentInput((prev) => prev.slice(0, -1));
        break;
      case (label === 17): // Sad Face (Insolent Finger)
        setIsSad(true);
        break;
      case (label === 18): // Prayer Protocol
        setIsSad(false);
        break;
      default:
        break;
    }


  }, [performOperation, performCalculation, isSad]);



  const handleLabel = useCallback((label: GestureLabel) => {
    if (label === lastLabel.current && label !== -1) {
      consecutiveFrames.current += 1;
      setGestureProgress(Math.min(consecutiveFrames.current / STABILIZATION_FRAMES, 1));
      setActiveGesture(label);

      if (consecutiveFrames.current === STABILIZATION_FRAMES) {
        handleGestureCommit(label);
        consecutiveFrames.current = 0;
      }
    } else {
      consecutiveFrames.current = 0;
      lastLabel.current = label;
      setGestureProgress(0);
      setActiveGesture(label);
    }
  }, [handleGestureCommit]);

  const processLandmarks = useCallback(async (results: Results) => {
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      consecutiveFrames.current = 0;
      lastLabel.current = -1;
      setGestureProgress(0);
      setActiveGesture(-1);
      return;
    }

    const multiLandmarks = results.multiHandLandmarks;
    const label = await gestureInference.predict(multiLandmarks);
    handleLabel(label);
  }, [handleLabel]);


  // V3.1: Expose simulation for testing
  useEffect(() => {
    (globalThis as unknown as { simulateGesture: (l: number) => void }).simulateGesture = (label: number) => {
       console.log(`[v3.1 Test] Simulating Label: ${label}`);
       handleGestureCommit(label as GestureLabel);
    };
  }, [handleGestureCommit]);


  return {
    currentInput,
    previousValue,
    operation,
    result,
    isSad,
    activeGesture,
    gestureProgress,
    processLandmarks,
    reset,

    displayValue: currentInput || result?.toString() || "0",
    equation: previousValue ? `${previousValue} ${operation} ${currentInput}` : currentInput || "0"
  };


};
