"use client";

import { useState, useCallback, useRef, useEffect } from "react";

import type { Results } from "@mediapipe/hands";
import { gestureInference, GestureLabel } from "@/lib/gestureInference";

export interface TestGesture {
  label: number;
  name: string;
  altLabels?: number[];
}

export const GESTURES_TO_TEST: TestGesture[] = [
  { label: 0, name: "Zero (Fist or O-Shape)" },
  { label: 11, name: "Plus (+)" },
  { label: 12, name: "Minus (-)" },
  { label: 13, name: "Multiply (*)" },
  { label: 14, name: "Divide (/)" },
  { label: 19, name: "Equals", altLabels: [15] },
  { label: 20, name: "Backspace", altLabels: [16] },
];

export interface TestResult {
  label: number;
  expectedName: string;
  detectedLabel: number;
  success: boolean;
  timestamp: number;
}

export const useGestureLogic = () => {
  const [currentInput, setCurrentInput] = useState<string>("");
  const [previousValue, setPreviousValue] = useState<string | null>(null);
  const [operation, setOperation] = useState<string | null>(null);
  const [result, setResult] = useState<number | null>(null);
  
  const [isSad, setIsSad] = useState(false);
  const [activeGesture, setActiveGesture] = useState<GestureLabel>(-1);

  const [gestureProgress, setGestureProgress] = useState(0); 
  
  // v4.2 Debug Test Mode State
  const [isTestMode, setIsTestMode] = useState(false);
  const [testIndex, setTestIndex] = useState(0);
  const [isAwaitingFeedback, setIsAwaitingFeedback] = useState(false);
  const [lastDetectedDuringTest, setLastDetectedDuringTest] = useState<GestureLabel>(-1);
  const [testReport, setTestReport] = useState<TestResult[]>([]);
  
  const consecutiveFrames = useRef<number>(0);
  const lastLabel = useRef<GestureLabel>(-1);
  const lastCommittedLabel = useRef<GestureLabel>(-1);
  const STABILIZATION_THRESHOLD = 5; // Reduced from 8 for v5.2 snappiness
  const STABILIZATION_FRAMES_REPEAT = 15; // Balanced for holding same gesture
  const POST_COMMIT_COOLDOWN_MS = 600; // Mandatory pause after a number is read
  const lastCommitTime = useRef<number>(0);

  // v3.0 Stabilization Refs (Prevents camera re-initialization)
  const isSadRef = useRef(false);
  const currentInputRef = useRef("");
  const previousValueRef = useRef<string | null>(null);
  const operationRef = useRef<string | null>(null);
  const resultRef = useRef<number | null>(null);

  // Sync state to refs for use in stable callbacks
  useEffect(() => { isSadRef.current = isSad; }, [isSad]);
  useEffect(() => { currentInputRef.current = currentInput; }, [currentInput]);
  useEffect(() => { previousValueRef.current = previousValue; }, [previousValue]);
  useEffect(() => { operationRef.current = operation; }, [operation]);
  useEffect(() => { resultRef.current = result; }, [result]);

  const calculate = (prev: string | null, curr: string, op: string | null) => {
    if (!prev || !curr || !op) return null;
    const a = Number.parseFloat(prev);
    const b = Number.parseFloat(curr);
    
    switch (op) {
      case "+": return a + b;
      case "-": return a - b;
      case "*": return a * b;
      case "/": return b === 0 ? null : a / b;
      default: return null;
    }
  };

  const performOperation = useCallback((op: "+" | "-" | "*" | "/") => {
    const cur = currentInputRef.current;
    const prev = previousValueRef.current;
    const oper = operationRef.current;
    const resValue = resultRef.current;

    if (cur) {
      if (prev && oper) {
        const res = calculate(prev, cur, oper);
        if (res !== null) {
          setPreviousValue(res.toString());
          setOperation(op);
          setCurrentInput("");
          return;
        }
      }
      setPreviousValue(cur);
      setOperation(op);
      setCurrentInput("");
    } else if (resValue !== null && oper === null) {
      setPreviousValue(resValue.toString());
      setOperation(op);
      setResult(null);
    }
  }, []); // Truly stable

  const performCalculation = useCallback(() => {
    const cur = currentInputRef.current;
    const prev = previousValueRef.current;
    const oper = operationRef.current;

    if (prev && cur && oper) {
      const res = calculate(prev, cur, oper);
      if (res !== null) {
        setResult(res);
        setCurrentInput(res.toString());
        setPreviousValue(null);
        setOperation(null);
      }
    }
  }, []); // Truly stable

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
    console.log(`[v4.0 HUD] COMMITTING GESTURE: ${label}`);
    lastCommittedLabel.current = label; 
    lastCommitTime.current = Date.now(); // Reset cooldown timer
    
    if (isTestMode) {
      setLastDetectedDuringTest(label);
      setIsAwaitingFeedback(true);
      return;
    }

    if (isSadRef.current && label !== 18) return; 

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
      case (label === 15 || label === 19): // Equals or Thumbs Up
        performCalculation();
        break;
      case (label === 16 || label === 20): // Backspace or Thumbs Down
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
  }, [performOperation, performCalculation, isTestMode]);

  const toggleTestMode = useCallback(() => {
    setIsTestMode(prev => {
      const newMode = !prev;
      gestureInference.verboseDebug = newMode;
      if (newMode) {
        setTestIndex(0);
        setTestReport([]);
        setIsAwaitingFeedback(false);
        console.log("[v4.2 Debug] TEST MODE ACTIVATED");
      } else {
        console.log("[v4.2 Debug] TEST MODE DEACTIVATED. Final Report:", testReport);
      }
      return newMode;
    });
  }, [testReport]);

  const submitTestFeedback = useCallback((userSuccess: boolean | null) => {
    const currentTest = GESTURES_TO_TEST[testIndex];
    const isActuallyCorrect = lastDetectedDuringTest === currentTest.label || 
                              !!currentTest.altLabels?.includes(lastDetectedDuringTest);
    
    // We trust the user's manual success/failure click if they provided it,
    // otherwise we default to the detection match.
    const finalSuccess = (userSuccess === true) || (userSuccess === null && isActuallyCorrect);
    
    const newResult: TestResult = {
      label: currentTest.label,
      expectedName: currentTest.name,
      detectedLabel: lastDetectedDuringTest,
      success: finalSuccess,
      timestamp: Date.now()
    };

    console.log(`[v4.5 Test] Result for ${currentTest.name}: ${finalSuccess ? 'SUCCESS' : 'FAILURE'} (Detected: ${lastDetectedDuringTest})`);
    
    setTestReport(prev => [...prev, newResult]);
    setIsAwaitingFeedback(false);
    
    if (testIndex < GESTURES_TO_TEST.length - 1) {
      setTestIndex(prev => prev + 1);
    } else {
      console.table(testReport);
      // Mode stays active but user can exit manually
    }
  }, [testIndex, lastDetectedDuringTest, testReport]);



  const handleLabel = useCallback((label: GestureLabel) => {
    // [v4.1 Logic] Post-Commit Cooldown check
    // Prevents accidental double-reading of numbers by forcing a gap
    if (Date.now() - lastCommitTime.current < POST_COMMIT_COOLDOWN_MS) {
      consecutiveFrames.current = 0;
      setGestureProgress(0);
      return;
    }

    if (label === lastLabel.current && label !== -1) {
      const isRepeat = label === lastCommittedLabel.current;
      const threshold = isRepeat ? STABILIZATION_FRAMES_REPEAT : STABILIZATION_THRESHOLD;
      
      consecutiveFrames.current += 1;
      setGestureProgress(Math.min(consecutiveFrames.current / threshold, 1));
      setActiveGesture(label);

      if (consecutiveFrames.current >= threshold) {
        handleGestureCommit(label);
        consecutiveFrames.current = 0;
      }
    } else {
      consecutiveFrames.current = 0;
      lastLabel.current = label;
      setGestureProgress(0);
      setActiveGesture(label);
      
      // If we just moved to a NEW gesture, or back to a gesture we haven't committed recently
      if (label !== lastCommittedLabel.current) {
         // Start progress immediately for new labels
      }
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
    const label = await gestureInference.predict(multiLandmarks, results.multiHandedness);

    // [v4.0] INSTANT PRAYER BYPASS
    // If the "Rude Gesture" screen is active, any detection of Prayer clears it immediately.
    if (isSadRef.current && (label === 18)) {
      console.log("[v4.0 HUD] Instant Prayer protocol engaged. Restoring systems...");
      setIsSad(false);
      consecutiveFrames.current = 0;
      setGestureProgress(0);
      return;
    }

    handleLabel(label as GestureLabel);
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

    // [v4.2 Test Mode Exports]
    isTestMode,
    testIndex,
    isAwaitingFeedback,
    lastDetectedDuringTest,
    testReport,
    toggleTestMode,
    submitTestFeedback,
    GESTURES_TO_TEST,

    displayValue: currentInput || result?.toString() || "0",
    equation: previousValue ? `${previousValue} ${operation} ${currentInput}` : currentInput || "0"
  };


};
