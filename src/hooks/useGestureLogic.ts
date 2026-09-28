"use client";

import { useState, useCallback, useRef, useEffect } from "react";

import type { Results } from "@mediapipe/hands";
import { gestureEngine, GESTURE_NAMES, type GestureLabel, type GestureResult } from "@/lib/gesture";

export interface TestGesture {
  label: number;
  name: string;
  altLabels?: number[];
}

export const GESTURES_TO_TEST: TestGesture[] = [
  { label: 0, name: "Zero (Fist)" },
  { label: 1, name: "One (1)" },
  { label: 2, name: "Two (2)" },
  { label: 3, name: "Three (3)" },
  { label: 4, name: "Four (4)" },
  { label: 5, name: "Five (5)" },
  { label: 6, name: "Six (6)" },
  { label: 7, name: "Seven (7)" },
  { label: 8, name: "Eight (8)" },
  { label: 9, name: "Nine (9)" },
  { label: 10, name: "Ten (10)" },
  { label: 11, name: "Plus (+)" },
  { label: 12, name: "Minus (-)" },
  { label: 13, name: "Multiply (x)" },
  { label: 14, name: "Divide (/)" },
  { label: 19, name: "Thumbs Up (=)" },
  { label: 20, name: "Thumbs Down (bksp)" },
  { label: 18, name: "Reset (Prayer)" },
];

/** Compact, serializable snapshot of a frame, for the debug report. */
export interface GestureSnapshot {
  reason: string;
  totalFingers: number;
  hands: {
    handedness: string;
    fingers: string;
    count: number;
    fingerAngle: number;
    indexAngle: number;
    thumbAngle: number;
    together: boolean;
    tipGap: number;
    flat: boolean;
    curls: number[];
    thumbOut: number;
    usingWorld: boolean;
  }[];
}

/** Live per-frame diagnostics, for the on-screen debug panel. */
export interface DebugInfo {
  fps: number;
  handCount: number;
  /** What the classifier said this frame. */
  rawLabel: number;
  /** What survived the majority vote; -1 means the frame was ambiguous. */
  smoothedLabel: number;
  /** 0-1 toward committing. */
  progress: number;
  snapshot: GestureSnapshot;
}

export interface TestResult {
  label: number;
  expectedName: string;
  detectedLabel: number;
  success: boolean;
  reason?: string;
  snapshot?: GestureSnapshot;
  timestamp: number;
}

const round = (n: number) => Math.round(n * 10) / 10;

export function summarize(result: GestureResult): GestureSnapshot {
  return {
    reason: result.reason,
    totalFingers: result.totalFingers,
    hands: result.hands.map((h) => ({
      handedness: h.handedness,
      // Compact glyph strip, thumb first: "^" extended, "." folded.
      fingers: h.fingers.map((f) => (f ? "^" : ".")).join(""),
      count: h.count,
      fingerAngle: round(h.fingerAngle),
      indexAngle: round(h.indexAngle),
      thumbAngle: round(h.thumbAngle),
      together: h.fingersTogether,
      tipGap: Math.round(h.tipGap * 100) / 100,
      flat: h.isFlat,
      curls: h.jointAngles.curls.map(round),
      thumbOut: Math.round(h.jointAngles.thumbOut * 100) / 100,
      usingWorld: h.usingWorld,
    })),
  };
}

/**
 * Recognition timing. Expressed in milliseconds rather than frames so the feel
 * is identical on a 60fps laptop and a throttled phone.
 */
const HISTORY_SIZE = 5;
const MAJORITY_NEEDED = 3;
const HOLD_MS_NEW = 450;
const HOLD_MS_REPEAT = 850;
const COOLDOWN_MS = 700;

export const useGestureLogic = () => {
  const [currentInput, setCurrentInput] = useState<string>("");
  const [previousValue, setPreviousValue] = useState<string | null>(null);
  const [operation, setOperation] = useState<string | null>(null);
  const [result, setResult] = useState<number | null>(null);

  const [isSad, setIsSad] = useState(false);
  /** The last gesture that was entered, shown briefly so every commit is visible. */
  const [commitFlash, setCommitFlash] = useState<{ label: GestureLabel; note: string | null; at: number } | null>(null);
  const [activeGesture, setActiveGesture] = useState<GestureLabel>(-1);
  const [gestureProgress, setGestureProgress] = useState(0);

  const [isTestMode, setIsTestMode] = useState(false);
  const [testIndex, setTestIndex] = useState(0);
  const [isAwaitingFeedback, setIsAwaitingFeedback] = useState(false);
  const [lastDetectedDuringTest, setLastDetectedDuringTest] = useState<GestureLabel>(-1);
  const [testReport, setTestReport] = useState<TestResult[]>([]);
  const [committedSnapshot, setCommittedSnapshot] = useState<GestureSnapshot | null>(null);
  const [liveSnapshot, setLiveSnapshot] = useState<GestureSnapshot | null>(null);

  const lastLabel = useRef<GestureLabel>(-1);
  const lastCommittedLabel = useRef<GestureLabel>(-1);
  /**
   * Set on every commit. While set, the committed gesture cannot fire again
   * until the user releases it: drops the hand or shows a different gesture.
   * Without this, simply holding "1" typed 1111... every second or so.
   */
  const awaitingRelease = useRef(false);
  const holdStart = useRef<number>(0);
  const lastCommitTime = useRef<number>(0);
  const reportedProgress = useRef<number>(0);

  const currentInputRef = useRef("");
  const previousValueRef = useRef<string | null>(null);
  const operationRef = useRef<string | null>(null);
  const resultRef = useRef<number | null>(null);
  const isTestModeRef = useRef(false);
  const isAwaitingFeedbackRef = useRef(false);

  const labelHistory = useRef<GestureLabel[]>([]);
  const liveSnapshotRef = useRef<GestureSnapshot | null>(null);

  const [debugEnabled, setDebugEnabled] = useState(false);
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const debugEnabledRef = useRef(false);
  const frameStamps = useRef<number[]>([]);
  const lastDebugPush = useRef(0);
  const lastSmoothed = useRef<GestureLabel>(-1);
  const lastProgress = useRef(0);

  const toggleDebug = useCallback(() => {
    setDebugEnabled((prev) => {
      debugEnabledRef.current = !prev;
      if (prev) setDebugInfo(null);
      return !prev;
    });
  }, []);

  /**
   * Majority vote over a short window. A single bad frame cannot move the
   * result, and an genuinely ambiguous pose resolves to -1 rather than
   * flickering between two answers.
   */
  const getSmoothedLabel = (label: GestureLabel): GestureLabel => {
    const history = labelHistory.current;
    history.push(label);
    if (history.length > HISTORY_SIZE) history.shift();

    const counts = new Map<GestureLabel, number>();
    history.forEach((l) => counts.set(l, (counts.get(l) ?? 0) + 1));

    let best: GestureLabel = -1;
    let bestCount = 0;
    counts.forEach((count, l) => {
      if (count > bestCount) {
        bestCount = count;
        best = l;
      }
    });

    return bestCount >= MAJORITY_NEEDED ? best : -1;
  };

  useEffect(() => { currentInputRef.current = currentInput; }, [currentInput]);
  useEffect(() => { previousValueRef.current = previousValue; }, [previousValue]);
  useEffect(() => { operationRef.current = operation; }, [operation]);
  useEffect(() => { resultRef.current = result; }, [result]);
  useEffect(() => { isTestModeRef.current = isTestMode; }, [isTestMode]);
  useEffect(() => { isAwaitingFeedbackRef.current = isAwaitingFeedback; }, [isAwaitingFeedback]);

  const calculate = useCallback((prev: string | null, curr: string, op: string | null) => {
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
  }, []);

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
  }, [calculate]);

  /** Returns a note for the commit flash when there was nothing to do. */
  const performCalculation = useCallback((): string | null => {
    const cur = currentInputRef.current;
    const prev = previousValueRef.current;
    const oper = operationRef.current;
    if (!prev || !oper) return "needs a sum first, e.g. 5 + 3";
    if (!cur) return "needs a second number";
    const res = calculate(prev, cur, oper);
    if (res === null) return "cannot divide by zero";
    setResult(res);
    setCurrentInput(res.toString());
    setPreviousValue(null);
    setOperation(null);
    return null;
  }, [calculate]);

  /** Deletes the last digit; with no digits pending, takes back the operator instead. */
  const backspace = useCallback((): string | null => {
    const cur = currentInputRef.current;
    if (cur) {
      setCurrentInput(cur.slice(0, -1));
      setResult(null);
      return null;
    }
    if (operationRef.current && previousValueRef.current !== null) {
      setCurrentInput(previousValueRef.current);
      setPreviousValue(null);
      setOperation(null);
      return "removed operator";
    }
    return "nothing to delete";
  }, []);

  const reset = useCallback(() => {
    setCurrentInput("");
    setPreviousValue(null);
    setOperation(null);
    setResult(null);
    setIsSad(false);
    lastLabel.current = -1;
    lastCommittedLabel.current = -1;
    labelHistory.current = [];
    setGestureProgress(0);
    setActiveGesture(-1);
  }, []);

  const handleGestureCommit = useCallback((label: GestureLabel) => {
    lastCommittedLabel.current = label;
    lastCommitTime.current = performance.now();
    awaitingRelease.current = true;

    if (isTestModeRef.current) {
      if (isAwaitingFeedbackRef.current) return;
      setLastDetectedDuringTest(label);
      setCommittedSnapshot(liveSnapshotRef.current);
      setIsAwaitingFeedback(true);
      return;
    }

    if (label !== 17) setIsSad(false);

    let note: string | null = null;
    switch (true) {
      case (label >= 0 && label <= 10): {
        // A digit straight after "=" starts a new number rather than
        // appending to the result.
        const base = resultRef.current !== null ? "" : currentInputRef.current;
        setCurrentInput(base + label.toString());
        setResult(null);
        break;
      }
      case (label === 11): performOperation("+"); break;
      case (label === 12): performOperation("-"); break;
      case (label === 13): performOperation("*"); break;
      case (label === 14): performOperation("/"); break;
      case (label === 19): note = performCalculation(); break;
      case (label === 20): note = backspace(); break;
      case (label === 18): reset(); break;
      // 17 is recognised purely so it does not get miscounted as a digit.
      case (label === 17): setIsSad(true); break;
      default: break;
    }
    setCommitFlash({ label, note, at: performance.now() });
  }, [performOperation, performCalculation, backspace, reset]);

  const toggleTestMode = useCallback(() => {
    setIsTestMode((prev) => {
      const newMode = !prev;
      if (newMode) {
        setTestIndex(0);
        setTestReport([]);
        setIsAwaitingFeedback(false);
      }
      return newMode;
    });
  }, []);

  const submitTestFeedback = useCallback((userSuccess: boolean | null) => {
    const currentTest = GESTURES_TO_TEST[testIndex];
    const isActuallyCorrect = lastDetectedDuringTest === currentTest.label ||
                              !!currentTest.altLabels?.includes(lastDetectedDuringTest);
    const finalSuccess = (userSuccess === true) || (userSuccess === null && isActuallyCorrect);
    const newResult: TestResult = {
      label: currentTest.label,
      expectedName: currentTest.name,
      detectedLabel: lastDetectedDuringTest,
      success: finalSuccess,
      reason: committedSnapshot?.reason,
      snapshot: committedSnapshot ?? undefined,
      timestamp: Date.now(),
    };

    const updatedReport = [...testReport, newResult];
    setTestReport(updatedReport);
    setCommittedSnapshot(null);
    setIsAwaitingFeedback(false);

    if (testIndex < GESTURES_TO_TEST.length - 1) {
      setTestIndex((prev) => prev + 1);
    } else {
      const name = (l: number) => GESTURE_NAMES[l] ?? `Unknown (${l})`;
      console.table(updatedReport.map((r) => {
        const h1 = r.snapshot?.hands[0];
        return {
          expected: r.expectedName,
          detected: name(r.detectedLabel),
          ok: r.success ? "PASS" : "FAIL",
          rule: r.reason,
          fingers: h1?.fingers ?? "-",
          angle: h1?.fingerAngle ?? "-",
          together: h1?.together ?? "-",
          hands: r.snapshot?.hands.length ?? 0,
        };
      }));
      console.log("Full debug report:", updatedReport);
    }
  }, [testIndex, lastDetectedDuringTest, testReport, committedSnapshot]);

  const clearTracking = useCallback(() => {
    // No hands in frame counts as letting go of the last gesture.
    awaitingRelease.current = false;
    lastLabel.current = -1;
    labelHistory.current = [];
    reportedProgress.current = 0;
    setGestureProgress(0);
    setActiveGesture(-1);
  }, []);

  /** Throttled so the progress bar does not re-render on every single frame. */
  const publishProgress = useCallback((value: number) => {
    if (Math.abs(value - reportedProgress.current) < 0.04 && value !== 0 && value !== 1) return;
    reportedProgress.current = value;
    setGestureProgress(value);
  }, []);

  const handleLabel = useCallback((label: GestureLabel) => {
    const smoothed = getSmoothedLabel(label);
    const now = performance.now();
    lastSmoothed.current = smoothed;
    lastProgress.current = 0;

    // Refuse to act while the previous commit is still settling, so one held
    // pose cannot fire twice in a row.
    if (now - lastCommitTime.current < COOLDOWN_MS) {
      publishProgress(0);
      setActiveGesture(-1);
      return;
    }

    if (smoothed === -1) {
      // Ambiguous frame. Stall the hold, but do NOT wipe the vote window —
      // clearing it here meant a single jittery frame reset the majority to
      // zero, so under real landmark noise nothing ever reached a commit.
      lastLabel.current = -1;
      publishProgress(0);
      setActiveGesture(-1);
      return;
    }

    if (awaitingRelease.current) {
      if (smoothed === lastCommittedLabel.current) {
        // Still holding what was just entered: show it, but do not re-arm.
        lastLabel.current = -1;
        setActiveGesture(smoothed);
        publishProgress(0);
        return;
      }
      awaitingRelease.current = false;
    }

    if (smoothed !== lastLabel.current) {
      lastLabel.current = smoothed;
      holdStart.current = now;
      setActiveGesture(smoothed);
      publishProgress(0);
      return;
    }

    // Re-entering the gesture that was just committed (after a release) takes
    // a little longer, so a hand wobbling in and out of frame cannot double it.
    const required = smoothed === lastCommittedLabel.current ? HOLD_MS_REPEAT : HOLD_MS_NEW;
    const progress = Math.min((now - holdStart.current) / required, 1);
    lastProgress.current = progress;

    setActiveGesture(smoothed);
    publishProgress(progress);

    if (progress >= 1) {
      handleGestureCommit(smoothed);
      labelHistory.current = [];
      lastLabel.current = -1;
      reportedProgress.current = 0;
    }
  }, [handleGestureCommit, publishProgress]);

  const processLandmarks = useCallback((results: Results) => {
    // Real delivered frame rate, which is what the hold and vote windows are
    // actually spending. Measured here rather than assumed to be 30fps.
    const now = performance.now();
    const stamps = frameStamps.current;
    stamps.push(now);
    while (stamps.length > 0 && now - stamps[0] > 1000) stamps.shift();

    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      clearTracking();
      liveSnapshotRef.current = null;
      setLiveSnapshot(null);
      if (debugEnabledRef.current) setDebugInfo(null);
      return;
    }

    const detailed = gestureEngine.read(results);

    if (isTestModeRef.current) {
      const snapshot = summarize(detailed);
      liveSnapshotRef.current = snapshot;
      setLiveSnapshot(snapshot);
    }

    handleLabel(detailed.label);

    // Debug mode only: expose the raw frame so a capture script can record real
    // landmarks from this camera and replay them against the classifier offline.
    if (debugEnabledRef.current) {
      (globalThis as typeof globalThis & { __gestureFrame?: unknown }).__gestureFrame = {
        t: now,
        label: detailed.label,
        hands: detailed.hands.map((h) => ({ handedness: h.handedness, screen: h.screen, world: h.world })),
      };
    }

    // Throttled: a full debug re-render on every frame would itself cost frames.
    if (debugEnabledRef.current && now - lastDebugPush.current > 150) {
      lastDebugPush.current = now;
      setDebugInfo({
        fps: stamps.length,
        handCount: detailed.hands.length,
        rawLabel: detailed.label,
        smoothedLabel: lastSmoothed.current,
        progress: lastProgress.current,
        snapshot: summarize(detailed),
      });
    }
  }, [handleLabel, clearTracking]);

  useEffect(() => {
    (globalThis as typeof globalThis & { simulateGesture?: (label: number) => void }).simulateGesture = (label: number) => {
      handleGestureCommit(label as GestureLabel);
    };
  }, [handleGestureCommit]);

  return {
    currentInput,
    previousValue,
    operation,
    result,
    isSad,
    commitFlash,
    activeGesture,
    gestureProgress,
    processLandmarks,
    reset,
    isTestMode,
    testIndex,
    isAwaitingFeedback,
    lastDetectedDuringTest,
    testReport,
    liveSnapshot,
    committedSnapshot,
    debugEnabled,
    debugInfo,
    toggleDebug,
    toggleTestMode,
    submitTestFeedback,
    GESTURES_TO_TEST,
    displayValue: currentInput || result?.toString() || "0",
    equation: previousValue ? `${previousValue} ${operation} ${currentInput}` : currentInput || "0",
  };
};
