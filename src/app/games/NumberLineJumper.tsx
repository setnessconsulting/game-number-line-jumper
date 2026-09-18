"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  ALL_BANDS,
  ariaValueText,
  BAND_META,
  createAdaptiveTargetGeneratorState,
  EXPLORE_ZOOM_ANCHOR,
  EXPLORE_ZOOM_LEVELS,
  exploreZoomNormForValue,
  exploreZoomPan,
  exploreZoomTicks,
  exploreZoomWindow,
  formatNumberValue as formatValue,
  generateAdaptiveTarget,
  mulberry32,
  rangesForBand,
  ROUND_MAX_TRIALS,
  ROUND_SECONDS,
  scorePlacement,
  summarizeRound,
  targetRevealAnnouncement,
  valueAtPosition,
} from "@/lib/numberLineJumper/engine";
import type { AdaptiveTargetGeneratorState } from "@/lib/numberLineJumper/engine";
import { generateExplorePrompt } from "@/lib/numberLineJumper/explorePrompt";
import { sessionAggregates } from "@/lib/numberLineJumper/aggregates";
import {
  createHostEventSinkV1,
  HOST_CONTRACT_VERSION,
  resolveHostContractV1,
  scheduleDeadlineV1,
} from "@/lib/numberLineJumper/hostContract";
import type {
  HostEventSinkV1,
  NumberLineJumperHostV1,
} from "@/lib/numberLineJumper/hostContract";
import { closeSoundContext, playSoundCue, soundCueForError, type SoundCue } from "@/lib/numberLineJumper/sound";
import {
  recordCallouts,
  updateVisitBests,
  visitBestsLine,
  type VisitBests,
} from "@/lib/numberLineJumper/visitBests";
import type {
  Closeness,
  NumberKind,
  PlacementBand,
  PlacementScore,
  Range,
  RoundMode,
  Target,
  TrialRecord,
} from "@/lib/numberLineJumper/types";

type Phase = "setup" | "intro" | "playing" | "reveal" | "done" | "explore";

function formatPct(error: number): string {
  return `${Math.round(error * 100)}%`;
}

function formatAverageError(error: number): string {
  return `${(error * 100).toFixed(1)}%`;
}

function formatRangeValue(value: number): string {
  return formatValue(value);
}

/** Reveal pause scales slightly with accuracy so coaching can be read. */
function revealMs(closeness: Closeness, reduceMotion: boolean): number {
  if (reduceMotion) return 900;
  if (closeness === "exact") return 1100;
  if (closeness === "close") return 1400;
  return 1700;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function posStyle(norm: number): CSSProperties {
  return { ["--nl-pos" as string]: String(norm) } as CSSProperties;
}

function midpointLabel(range: Range): string {
  const span = range.max - range.min;
  if (span === 1 && range.min === 0) return "½";
  return formatValue(range.min + span / 2);
}

function kindLabel(kind: NumberKind): string {
  switch (kind) {
    case "whole":
      return "whole numbers";
    case "fraction":
      return "fractions";
    case "decimal":
      return "decimals";
    case "negative":
      return "negative numbers";
  }
}

function hintForTarget(target: Target, midpoint: string): string {
  if (target.range.min < 0 && target.range.max > 0) {
    return "Find 0 first. Then decide whether the target belongs to the negative or positive side.";
  }
  if (target.kind === "fraction") {
    return `Start with the midpoint: ${midpoint}. Use the denominator to imagine equal-sized parts.`;
  }
  if (target.kind === "decimal") {
    return `Start with the midpoint: ${midpoint}. Then use tenths or hundredths to make a small adjustment.`;
  }
  return `Start with the midpoint: ${midpoint}. Then decide whether the target belongs to the left or right half.`;
}

function biasCopy(bias: "low" | "high" | "balanced" | "unknown"): string | null {
  if (bias === "low") return "Your estimates tended to land low; try nudging a little farther right after finding the midpoint.";
  if (bias === "high") return "Your estimates tended to land high; try nudging a little farther left after finding the midpoint.";
  if (bias === "balanced") return "Your estimates moved on both sides of the targets, so keep using the midpoint as your anchor.";
  return null;
}

function HostBreakBadge({ secondsRemaining }: { secondsRemaining: number | null }) {
  return secondsRemaining === null
    ? null
    : <p className="microcopy" role="timer" aria-label={`Break time remaining: ${secondsRemaining} seconds`}>Break · {secondsRemaining}s left</p>;
}

/** Module-scope seed source keeps the impure call out of component render scope. */
function newGameSeed(): number {
  return Date.now() % 1_000_000;
}

export default function NumberLineJumper({
  onExit,
  host,
}: {
  onExit: () => void;
  host?: NumberLineJumperHostV1;
}) {
  const [hostRuntime] = useState(() => resolveHostContractV1(host));
  const hostCallbacksRef = useRef(host?.callbacks);
  hostCallbacksRef.current = host?.callbacks;
  const hostEventSinkRef = useRef<HostEventSinkV1 | null>(null);
  if (hostEventSinkRef.current === null) {
    hostEventSinkRef.current = createHostEventSinkV1({
      onExit: (event) => hostCallbacksRef.current?.onExit?.(event),
      onReturnToPractice: (event) => hostCallbacksRef.current?.onReturnToPractice?.(event),
      onRoundComplete: (event) => hostCallbacksRef.current?.onRoundComplete?.(event),
      onSessionAggregate: (event) => hostCallbacksRef.current?.onSessionAggregate?.(event),
      onError: (event) => hostCallbacksRef.current?.onError?.(event),
    });
  }
  const hostEventSink = hostEventSinkRef.current;
  const [band, setBand] = useState<PlacementBand | null>(null);
  const [phase, setPhase] = useState<Phase>("setup");
  const [mode, setMode] = useState<RoundMode>("guided");
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const [hostBreakSecondsLeft, setHostBreakSecondsLeft] = useState<number | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [markerNorm, setMarkerNorm] = useState(0.5);
  const [warmupNorm, setWarmupNorm] = useState(0.5);
  const [warmupRevealed, setWarmupRevealed] = useState(false);
  const [exploreBand, setExploreBand] = useState<PlacementBand>("g12");
  const [exploreRangeIndex, setExploreRangeIndex] = useState(0);
  const [exploreNorm, setExploreNorm] = useState(0.5);
  // GAME-5: zoomable Explore window (-10...1000 anchor). Level 0 shows the
  // whole anchor; deeper levels narrow the visible window. Session-only.
  const [exploreZoom, setExploreZoom] = useState(0);
  const [explorePrompt, setExplorePrompt] = useState<number | null>(null);
  const [exploreFound, setExploreFound] = useState<number | null>(null);
  // Pinch-zoom refs: pointer cache + starting distance/level, no state churn.
  const explorePointersRef = useRef(new Map<number, number>());
  const pinchRef = useRef<{ startDistance: number; startLevel: number } | null>(null);
  const exploreZoomSliderId = useId();
  const [exploreShowHint, setExploreShowHint] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [lastScore, setLastScore] = useState<PlacementScore | null>(null);
  const [trials, setTrials] = useState<TrialRecord[]>([]);
  const [scoreTotal, setScoreTotal] = useState(0);
  const [targetIndex, setTargetIndex] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [announce, setAnnounce] = useState("");
  // Visit bests live in React memory for this page session only.
  // Null until a first completed run; a remount/reload starts a fresh visit.
  const [visitBests, setVisitBests] = useState<VisitBests | null>(null);
  const [visitDelta, setVisitDelta] = useState({ averageError: false, closeStreak: false });

  const rngRef = useRef<() => number>(() => 0.5);
  const exploreRngRef = useRef<() => number>(() => 0.5);
  const adaptiveGeneratorStateRef = useRef<AdaptiveTargetGeneratorState>(createAdaptiveTargetGeneratorState());
  const runBandRef = useRef<PlacementBand | null>(null);
  const runModeRef = useRef<RoundMode>("guided");
  const targetIndexRef = useRef(0);
  const trialsRef = useRef<TrialRecord[]>([]);
  const sessionTrialsRef = useRef<TrialRecord[]>([]);
  const roundNumberRef = useRef(0);
  const roundFinalizedRef = useRef(false);
  const hostBreakCompletedRef = useRef(false);
  const hostAutoStartRef = useRef(false);
  const exitRequestedRef = useRef(false);
  const visitBestsRef = useRef<VisitBests | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<HTMLDivElement>(null);
  const pendingPointerNormRef = useRef<number | null>(null);
  const pointerFrameRef = useRef<number | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const advanceTimerRef = useRef<number | null>(null);
  const lineId = useId();
  const valueId = useId();
  const warmupLineId = useId();
  const warmupValueId = useId();
  const exploreLineId = useId();
  const exploreValueId = useId();

  const clearAdvanceTimer = useCallback(() => {
    if (advanceTimerRef.current !== null) {
      window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    hostEventSink.activate();
    return () => hostEventSink.dispose();
  }, [hostEventSink]);

  useEffect(() => {
    for (const error of hostRuntime.errors) hostEventSink.reportError(error);
  }, [hostEventSink, hostRuntime]);

  useEffect(() => {
    if (hostRuntime.mode !== "break" || hostRuntime.deadlineEpochMs === null) {
      setHostBreakSecondsLeft(null);
      return;
    }
    const updateRemaining = () => {
      setHostBreakSecondsLeft(Math.ceil(Math.max(0, hostRuntime.deadlineEpochMs! - Date.now()) / 1_000));
    };
    updateRemaining();
    const interval = window.setInterval(updateRemaining, 1_000);
    return () => window.clearInterval(interval);
  }, [hostRuntime]);

  useEffect(() => {
    if (hostRuntime.mode !== "break" || hostRuntime.deadlineEpochMs === null) return;
    return scheduleDeadlineV1(hostRuntime.deadlineEpochMs, {
      now: () => Date.now(),
      schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
      cancel: (handle) => window.clearTimeout(handle as number),
    }, () => {
      if (hostBreakCompletedRef.current) return;
      hostBreakCompletedRef.current = true;
      const context = hostRuntime.sessionContext;
      hostEventSink.emitSessionAggregate({
        version: HOST_CONTRACT_VERSION,
        reason: "break-complete",
        aggregate: sessionAggregates({ trials: sessionTrialsRef.current }),
        context,
      });
      hostEventSink.emitReturnToPractice({ version: HOST_CONTRACT_VERSION, reason: "deadline", context });
    });
  }, [hostEventSink, hostRuntime]);

  const playCue = useCallback(
    (cue: SoundCue) => {
      if (soundEnabled) playSoundCue(audioContextRef, cue);
    },
    [soundEnabled],
  );

  const exitGame = useCallback(() => {
    if (exitRequestedRef.current) return;
    exitRequestedRef.current = true;
    clearAdvanceTimer();
    const context = hostRuntime.sessionContext;
    hostEventSink.emitSessionAggregate({
      version: HOST_CONTRACT_VERSION,
      reason: "exit",
      aggregate: sessionAggregates({ trials: sessionTrialsRef.current }),
      context,
    });
    if (hostRuntime.mode === "break") {
      hostEventSink.emitReturnToPractice({ version: HOST_CONTRACT_VERSION, reason: "user-exit", context });
    }
    hostEventSink.emitExit({ version: HOST_CONTRACT_VERSION, reason: "user-exit", mode: hostRuntime.mode, context });
    onExit();
  }, [clearAdvanceTimer, hostEventSink, hostRuntime, onExit]);

  const endRound = useCallback(() => {
    if (roundFinalizedRef.current) return;
    roundFinalizedRef.current = true;
    clearAdvanceTimer();
    playCue("finish");
    const summary = summarizeRound(trialsRef.current);
    const runBand = runBandRef.current;
    if (runBand) {
      hostEventSink.emitRoundComplete({
        version: HOST_CONTRACT_VERSION,
        roundNumber: roundNumberRef.current,
        band: runBand,
        mode: runModeRef.current,
        summary,
        sessionAggregate: sessionAggregates({ trials: sessionTrialsRef.current }),
        context: hostRuntime.sessionContext,
      });
    }
    // Fold the finished run into the session-only visit bests.
    // Uses the trials/visit refs so timer callbacks never see stale state.
    const result = updateVisitBests(visitBestsRef.current, summarizeRound(trialsRef.current));
    visitBestsRef.current = result.bests;
    setVisitBests(result.bests);
    setVisitDelta(result.delta);
    setPhase("done");
    setCommitted(false);
    setLastScore(null);
    setAnnounce("");
  }, [clearAdvanceTimer, hostEventSink, hostRuntime, playCue]);

  const nextTarget = useCallback((completedTrials: readonly TrialRecord[]) => {
    clearAdvanceTimer();
    const nextIndex = targetIndexRef.current + 1;
    const runBand = runBandRef.current;
    if (!runBand || nextIndex >= ROUND_MAX_TRIALS) {
      endRound();
      return;
    }
    const generated = generateAdaptiveTarget(
      runBand,
      rngRef.current,
      nextIndex,
      runModeRef.current,
      completedTrials,
      adaptiveGeneratorStateRef.current,
    );
    adaptiveGeneratorStateRef.current = generated.state;
    targetIndexRef.current = nextIndex;
    setTargetIndex(nextIndex);
    setTarget(generated.target);
    setMarkerNorm(0.5);
    setCommitted(false);
    setLastScore(null);
    setShowHint(false);
    setAnnounce("");
    setPhase("playing");
  }, [clearAdvanceTimer, endRound]);

  function prepareRound(id: PlacementBand) {
    clearAdvanceTimer();
    roundFinalizedRef.current = false;
    const nextSeed = newGameSeed();
    rngRef.current = mulberry32(nextSeed);
    runBandRef.current = id;
    runModeRef.current = mode;
    adaptiveGeneratorStateRef.current = createAdaptiveTargetGeneratorState();
    const first = generateAdaptiveTarget(
      id,
      rngRef.current,
      0,
      mode,
      [],
      adaptiveGeneratorStateRef.current,
    );
    adaptiveGeneratorStateRef.current = first.state;
    targetIndexRef.current = 0;
    setBand(id);
    setTimeLeft(ROUND_SECONDS);
    setTargetIndex(0);
    trialsRef.current = [];
    setTrials([]);
    setScoreTotal(0);
    setCommitted(false);
    setLastScore(null);
    setShowHint(false);
    setWarmupNorm(0.5);
    setWarmupRevealed(false);
    setAnnounce("");
    setTarget(first.target);
    setMarkerNorm(0.5);
  }

  function selectBand(id: PlacementBand) {
    prepareRound(id);
    if (mode === "guided") {
      setPhase("intro");
      return;
    }
    roundNumberRef.current += 1;
    setPhase("playing");
    playCue("start");
  }

  function startRound(id: PlacementBand) {
    prepareRound(id);
    roundNumberRef.current += 1;
    setPhase("playing");
    playCue("start");
  }

  useEffect(() => {
    if (hostAutoStartRef.current || !hostRuntime.autoStart || !hostRuntime.initialBand) return;
    hostAutoStartRef.current = true;
    startRound(hostRuntime.initialBand);
  }, [hostRuntime]);

  function goToSetup() {
    clearAdvanceTimer();
    setBand(null);
    setTarget(null);
    setPhase("setup");
    setAnnounce("");
  }

  function beginExplore() {
    clearAdvanceTimer();
    exploreRngRef.current = mulberry32(newGameSeed());
    setBand(null);
    setTarget(null);
    setExploreNorm(0.5);
    setExploreShowHint(false);
    setExploreZoom(0);
    setExplorePrompt(null);
    setExploreFound(null);
    explorePointersRef.current.clear();
    pinchRef.current = null;
    setPhase("explore");
    setAnnounce("");
  }

  /** GAME-5: zoom the Explore window, preserving the jumper's value when possible. */
  function zoomExplore(nextLevel: number) {
    const clamped = Math.min(EXPLORE_ZOOM_LEVELS - 1, Math.max(0, Math.floor(nextLevel)));
    if (clamped === exploreZoom) return;
    const previous = exploreZoomWindow(exploreZoom, exploreNorm);
    const nextWindow = exploreZoomWindow(clamped, exploreNorm, previous);
    const value = valueAtPosition(exploreNorm, previous);
    setExploreNorm(exploreZoomNormForValue(value, nextWindow));
    setExploreFound(null);
    setExploreZoom(clamped);
  }

  /** GAME-5: pan the Explore window half a span; jumper value preserved. */
  function panExplore(direction: 1 | -1) {
    const window = exploreZoomWindow(exploreZoom, exploreNorm);
    const value = valueAtPosition(exploreNorm, window);
    const next = exploreZoomPan(window, direction);
    setExploreNorm(exploreZoomNormForValue(value, next));
    setExploreFound(null);
  }

  /** GAME-5: optional unscored "find this number" mini-prompt inside Explore. */
  function newExplorePrompt() {
    const window = exploreZoomWindow(exploreZoom, exploreNorm);
    const nextPrompt = generateExplorePrompt(window, exploreRngRef.current, explorePrompt);
    setExplorePrompt(nextPrompt);
    setExploreFound(null);
    setAnnounce(`Find ${formatValue(nextPrompt)} on this line. Unscored practice.`);
  }

  function checkExplorePrompt(value: number) {
    if (explorePrompt === null) return;
    const window = exploreZoomWindow(exploreZoom, exploreNorm);
    const span = window.max - window.min;
    if (span <= 0) return;
    const ticks = exploreZoomTicks(window);
    const tolerance = Math.max(span * 0.02, ticks.minor / 2);
    if (Math.abs(value - explorePrompt) <= tolerance) {
      setExploreFound(explorePrompt);
      setAnnounce(`Found ${formatValue(explorePrompt)}. Nice estimating — try a new number or zoom deeper.`);
    }
  }

  useEffect(() => () => clearAdvanceTimer(), [clearAdvanceTimer]);

  useEffect(() => () => {
    if (pointerFrameRef.current !== null) window.cancelAnimationFrame(pointerFrameRef.current);
  }, []);

  useEffect(() => () => closeSoundContext(audioContextRef), []);

  useEffect(() => {
    if (phase !== "playing") return;
    if (timeLeft <= 0) {
      const endTimer = window.setTimeout(() => endRound(), 0);
      return () => window.clearTimeout(endTimer);
    }
    const timer = window.setTimeout(() => setTimeLeft((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [phase, timeLeft, endRound]);

  useEffect(() => {
    if ((phase === "playing" || phase === "intro" || phase === "explore" || phase === "done") && headingRef.current) {
      headingRef.current.focus({ preventScroll: true });
    }
    if (phase === "reveal" && feedbackRef.current) {
      feedbackRef.current.focus({ preventScroll: true });
    }
  }, [phase, target?.display, committed]);

  function activeRange(): Range {
    if (phase === "explore") {
      // GAME-5: the zoom window is the single source of truth for Explore.
      // Recomputed from (exploreZoom, exploreNorm), so zoom, pan, marker,
      // and readout never drift from each other.
      return exploreZoomWindow(exploreZoom, exploreNorm);
    }
    return target?.range ?? { min: 0, max: 1 };
  }

  function activeNorm(): number {
    if (phase === "intro") return warmupNorm;
    if (phase === "explore") return exploreNorm;
    return markerNorm;
  }

  function setActiveNorm(next: number) {
    if (pointerFrameRef.current !== null) {
      window.cancelAnimationFrame(pointerFrameRef.current);
      pointerFrameRef.current = null;
    }
    pendingPointerNormRef.current = null;
    if (phase === "intro") setWarmupNorm(next);
    else if (phase === "explore") setExploreNorm(next);
    else setMarkerNorm(next);
  }

  function queuePointerNorm(next: number) {
    pendingPointerNormRef.current = next;
    markerRef.current?.style.setProperty("--nl-pos", String(next));
    if (pointerFrameRef.current !== null) return;
    pointerFrameRef.current = window.requestAnimationFrame(() => {
      pointerFrameRef.current = null;
      const pending = pendingPointerNormRef.current;
      pendingPointerNormRef.current = null;
      if (pending !== null) {
        if (phase === "intro") setWarmupNorm(pending);
        else if (phase === "explore") setExploreNorm(pending);
        else setMarkerNorm(pending);
      }
    });
  }

  function flushPointerNorm() {
    const pending = pendingPointerNormRef.current;
    if (pointerFrameRef.current !== null) {
      window.cancelAnimationFrame(pointerFrameRef.current);
      pointerFrameRef.current = null;
    }
    pendingPointerNormRef.current = null;
    if (pending !== null) setActiveNorm(pending);
  }

  function normFromClientX(clientX: number): number {
    const el = trackRef.current;
    if (!el) return 0.5;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return 0.5;
    const inset = 12;
    const usable = Math.max(1, rect.width - inset * 2);
    return Math.min(1, Math.max(0, (clientX - rect.left - inset) / usable));
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (phase !== "playing" && phase !== "intro" && phase !== "explore") return;
    if (phase === "playing" && committed) return;
    if (phase === "intro" && warmupRevealed) return;
    if (phase === "explore") {
      // GAME-5: track every Explore pointer for two-finger pinch-zoom.
      explorePointersRef.current.set(event.pointerId, event.clientX);
      if (explorePointersRef.current.size >= 2) {
        const xs = [...explorePointersRef.current.values()];
        pinchRef.current = {
          startDistance: Math.max(1, Math.abs(xs[0]! - xs[xs.length - 1]!)),
          startLevel: exploreZoom,
        };
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // A pointer can disappear before capture on synthetic/headless or interrupted input.
        }
        return;
      }
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Continue the interaction even when capture is unavailable.
    }
    draggingRef.current = true;
    setActiveNorm(normFromClientX(event.clientX));
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    // GAME-5: pinch distance maps to zoom level steps (session-only).
    if (phase === "explore" && explorePointersRef.current.has(event.pointerId)) {
      explorePointersRef.current.set(event.pointerId, event.clientX);
      const pinch = pinchRef.current;
      if (pinch && explorePointersRef.current.size >= 2) {
        const xs = [...explorePointersRef.current.values()];
        const distance = Math.max(1, Math.abs(xs[0]! - xs[xs.length - 1]!));
        const steps = Math.round((distance - pinch.startDistance) / 48);
        if (steps !== 0) zoomExplore(pinch.startLevel + steps);
        return;
      }
    }
    if (!draggingRef.current || (phase !== "playing" && phase !== "intro" && phase !== "explore")) return;
    if (phase === "playing" && committed) return;
    if (phase === "intro" && warmupRevealed) return;
    queuePointerNorm(normFromClientX(event.clientX));
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (phase === "explore" && explorePointersRef.current.has(event.pointerId)) {
      explorePointersRef.current.delete(event.pointerId);
      if (explorePointersRef.current.size < 2) pinchRef.current = null;
      flushPointerNorm();
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // already released
      }
      draggingRef.current = explorePointersRef.current.size === 1;
      return;
    }
    if (!draggingRef.current) return;
    draggingRef.current = false;
    flushPointerNorm();
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // already released
    }
  }

  function revealWarmup() {
    if (!target) return;
    setWarmupRevealed(true);
    setAnnounce(targetRevealAnnouncement(target));
  }

  function commit() {
    if (phase !== "playing" || committed || !target) return;
    const result = scorePlacement(markerNorm, target);
    setLastScore(result);
    setCommitted(true);
    setPhase("reveal");
    setShowHint(false);
    setScoreTotal((value) => value + result.points);
    // The feedback panel is the one live region for the scored reveal. The hidden
    // value announcer remains reserved for marker movement so announcements do not duplicate.
    setAnnounce("");
    playCue(soundCueForError(result.error));

    const record: TrialRecord = {
      completed: true,
      error: result.error,
      absoluteError: result.absoluteError,
      playerValue: result.playerValue,
      targetValue: result.targetValue,
      direction: result.direction,
      kind: target.kind,
      range: target.range,
      intent: target.intent,
      closeness: result.closeness,
      points: result.points,
    };

    const delay = revealMs(result.closeness, prefersReducedMotion());
    const nextTrialCount = trials.length + 1;
    // Compute the next trials array once, purely, so the ref mirror and the
    // state stay in sync even under double-invoked updaters.
    const nextTrials = [...trials, record];
    trialsRef.current = nextTrials;
    sessionTrialsRef.current = [...sessionTrialsRef.current, record];
    setTrials(nextTrials);
    clearAdvanceTimer();
    advanceTimerRef.current = window.setTimeout(() => {
      if (nextTrialCount >= ROUND_MAX_TRIALS) endRound();
      else nextTarget(nextTrials);
    }, delay);
  }

  function moveMarker(next: number) {
    const clamped = Math.min(1, Math.max(0, next));
    setActiveNorm(clamped);
    const range = activeRange();
    const value = valueAtPosition(clamped, range);
    setAnnounce(
      `Estimate at ${formatValue(value)}, ${Math.round(clamped * 100)} percent across the line.`,
    );
    if (phase === "explore") checkExplorePrompt(value);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (phase !== "playing" && phase !== "intro" && phase !== "explore") return;
    if (phase === "playing" && committed) return;
    if (phase === "intro" && warmupRevealed) return;
    // GAME-5: Up/Down zooms the Explore window; Left/Right pans the jumper
    // (Up/Down pan playback placement only outside Explore, as before).
    if (phase === "explore" && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      zoomExplore(exploreZoom + (event.key === "ArrowUp" ? 1 : -1));
      return;
    }
    if (phase === "explore" && (event.key === "PageUp" || event.key === "PageDown")) {
      event.preventDefault();
      panExplore(event.key === "PageUp" ? 1 : -1);
      return;
    }
    const step = event.shiftKey ? 0.05 : 0.02;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      moveMarker(activeNorm() - step);
    } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      moveMarker(activeNorm() + step);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (phase === "playing") commit();
      if (phase === "intro") revealWarmup();
    } else if (event.key === "Home") {
      event.preventDefault();
      moveMarker(0);
    } else if (event.key === "End") {
      event.preventDefault();
      moveMarker(1);
    }
  }

  if (phase === "setup") {
    return (
      <div className="demo-panel">
        <div className="demo-status">
          <span>Number Line Jumper · pick your level</span>
          <button type="button" className="link-button" onClick={exitGame}>All games</button>
        </div>
        <HostBreakBadge secondsRemaining={hostBreakSecondsLeft} />

        {hostRuntime.initialBand && !hostRuntime.autoStart ? (
          <p className="microcopy">Suggested level: {BAND_META[hostRuntime.initialBand].label}. You can choose another.</p>
        ) : null}

        <fieldset className="nl-mode-picker">
          <legend>How do you want to play?</legend>
          <label className="nl-mode-option">
            <input type="radio" name="number-line-mode" value="guided" checked={mode === "guided"} onChange={() => setMode("guided")} />
            <span><strong>Guided warm-up</strong><small>Recommended: practice the midpoint before the clock starts.</small></span>
          </label>
          <label className="nl-mode-option">
            <input type="radio" name="number-line-mode" value="challenge" checked={mode === "challenge"} onChange={() => setMode("challenge")} />
            <span><strong>Challenge</strong><small>Start immediately with more interior estimates and fewer easy anchors.</small></span>
          </label>
        </fieldset>

        <div className="setup-block">
          <h3>Choose a level</h3>
          {ALL_BANDS.map((id) => (
            <div key={id} className="nl-band-choice">
              <button type="button" className="subject-card" onClick={() => selectBand(id)}>
                <strong>{BAND_META[id].label}</strong>
                <span>{BAND_META[id].detail}</span>
              </button>
            </div>
          ))}
        </div>
        <p className="microcopy">
          Estimate where the number lands. You get {ROUND_SECONDS} seconds of estimating or {ROUND_MAX_TRIALS} tries —
          whichever comes first. Feedback pauses the clock, and closer estimates score more points.
        </p>
        <div className="nl-explore-start">
          <button type="button" className="button subtle" onClick={beginExplore}>Explore an untimed line</button>
          <span className="microcopy">No score, timer, or round pressure.</span>
        </div>
        <label className="nl-sound-toggle">
          <input type="checkbox" checked={soundEnabled} onChange={(event) => setSoundEnabled(event.target.checked)} />
          <span>Quiet sound cues (optional)</span>
        </label>
        <p className="microcopy nl-privacy-note">Session-only play — nothing about you is saved.</p>
      </div>
    );
  }

  if (phase === "intro" && band && target) {
    const range = target.range;
    const trueNorm = (target.value - range.min) / (range.max - range.min);
    const midLabel = midpointLabel(range);
    return (
      <div className="demo-panel">
        <div className="demo-status">
          <span>Number Line Jumper · guided warm-up</span>
          <button type="button" className="link-button" onClick={goToSetup}>Back to levels</button>
        </div>
        <HostBreakBadge secondsRemaining={hostBreakSecondsLeft} />
        <div className="eyebrow">Quick warm-up · no score</div>
        <h2 ref={headingRef} tabIndex={-1}>Build the picture before you jump.</h2>
        <p className="lede nl-intro-lede">
          This practice example does not use your timer or points. Find the endpoints, picture the midpoint, and then
          place the jumper where you think the target belongs.
        </p>
        <div className="nl-warmup-grid">
          <ol className="nl-warmup-steps">
            <li><strong>Find the ends.</strong> Read the smallest and largest labels.</li>
            <li><strong>Find the middle.</strong> Split the space into two equal parts.</li>
            <li><strong>Adjust.</strong> Use quarters or equal parts to get closer.</li>
          </ol>
          <div className="nl-warmup-example">
            <span>Practice target</span>
            <strong>{target.display}</strong>
            <small>on {formatRangeValue(range.min)} to {formatRangeValue(range.max)}</small>
          </div>
        </div>

        <div className="nl-track-wrap nl-warmup-track-wrap">
          <div className="nl-labels">
            <span>{formatRangeValue(range.min)}</span>
            <span className="nl-mid-label" aria-hidden="true">{midLabel}</span>
            <span>{formatRangeValue(range.max)}</span>
          </div>
          <div
            ref={trackRef}
            className={`nl-track ${warmupRevealed ? "nl-track-locked" : ""}`}
            role="slider"
            tabIndex={0}
            aria-labelledby={warmupLineId}
            aria-describedby={warmupValueId}
            aria-orientation="horizontal"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(warmupNorm * 100)}
            aria-valuetext={ariaValueText(warmupNorm, range)}
            aria-keyshortcuts="ArrowLeft ArrowRight Home End Enter Space"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onKeyDown}
            style={{ touchAction: "none" }}
          >
            <span id={warmupLineId} className="sr-only">Warm-up number line from {formatRangeValue(range.min)} to {formatRangeValue(range.max)}. Place a sample estimate.</span>
            <div className="nl-rail" aria-hidden="true" />
            <div className="nl-mid-tick" aria-hidden="true" />
            <div className="nl-quarter-tick nl-quarter-left" aria-hidden="true" />
            <div className="nl-quarter-tick nl-quarter-right" aria-hidden="true" />
            <div ref={markerRef} className={`nl-marker nl-marker-warmup ${warmupRevealed ? "nl-marker-reveal" : ""}`} style={posStyle(warmupNorm)} aria-hidden="true">
              <span className="nl-jumper-token"><span className="nl-marker-dot" /></span>
              <span className="nl-marker-label">Your practice estimate</span>
            </div>
            {warmupRevealed ? <div className="nl-truth nl-truth-reveal" style={posStyle(trueNorm)} aria-hidden="true"><span className="nl-truth-flag">{target.display}</span></div> : null}
          </div>
          <p id={warmupValueId} className="sr-only" aria-live="polite">{announce}</p>
        </div>

        <div className="demo-controls nl-action-row nl-intro-actions">
          <button type="button" className="button primary" onClick={revealWarmup} disabled={warmupRevealed}>{warmupRevealed ? "Example revealed" : "Reveal example"}</button>
          <button type="button" className="button subtle" onClick={() => startRound(band)}>Start guided round</button>
        </div>
        <p className="microcopy nl-privacy-note">The guided warm-up is practice only. Your timed round still uses {ROUND_SECONDS} seconds or {ROUND_MAX_TRIALS} tries.</p>
      </div>
    );
  }

  if (phase === "explore") {
    // GAME-5: the zoomable line always renders the anchor-derived window;
    // the legacy band/range picker stays as a quick-preset above it.
    const presetRanges = rangesForBand(exploreBand);
    const range = exploreZoomWindow(exploreZoom, exploreNorm);
    const ticks = exploreZoomTicks(range);
    const reduceMotion = prefersReducedMotion();
    const midLabel = midpointLabel(range);
    const readoutValue = formatValue(valueAtPosition(exploreNorm, range));
    const zoomLabel = `Zoom level ${exploreZoom + 1} of ${EXPLORE_ZOOM_LEVELS}, showing ${formatRangeValue(range.min)} to ${formatRangeValue(range.max)} with major ticks every ${formatValue(ticks.major)}`;
    return (
      <div className="demo-panel">
        <div className="demo-status">
          <span>Number Line Jumper · explore</span>
          <button type="button" className="link-button" onClick={goToSetup}>Back to levels</button>
        </div>
        <HostBreakBadge secondsRemaining={hostBreakSecondsLeft} />
        <div className="eyebrow">Untimed number sense lab</div>
        <h2 ref={headingRef} tabIndex={-1}>Move the jumper and notice the size.</h2>
        <p className="lede nl-intro-lede">
          Explore without points or a clock. Zoom from {formatRangeValue(EXPLORE_ZOOM_ANCHOR.min)} to {formatRangeValue(EXPLORE_ZOOM_ANCHOR.max)},
          place the jumper, and use the midpoint and tick marks to build a mental picture of place-value scaling.
        </p>

        <div className="nl-explore-controls">
          <div>
            <span className="nl-control-label">Line preset</span>
            <div className="chip-row" role="group" aria-label="Explore preset">
              {ALL_BANDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`grade-chip small ${exploreBand === id ? "selected" : ""}`}
                  aria-pressed={exploreBand === id}
                  onClick={() => {
                    setExploreBand(id);
                    setExploreRangeIndex(0);
                    // Jump the zoom window to the preset's first range midpoint.
                    const preset = presetRanges[0] ?? EXPLORE_ZOOM_ANCHOR;
                    const anchorValue = preset.min + (preset.max - preset.min) * 0.5;
                    const next = exploreZoomWindow(exploreZoom, exploreNorm);
                    setExploreNorm(exploreZoomNormForValue(anchorValue, next));
                    setExplorePrompt(null);
                    setExploreFound(null);
                  }}
                >
                  {BAND_META[id].label}
                </button>
              ))}
            </div>
          </div>
          <label className="nl-range-select">
            <span className="nl-control-label">Preset range</span>
            <select value={exploreRangeIndex} onChange={(event) => {
              const index = Number(event.target.value);
              setExploreRangeIndex(index);
              const preset = presetRanges[index] ?? presetRanges[0] ?? EXPLORE_ZOOM_ANCHOR;
              const anchorValue = preset.min + (preset.max - preset.min) * 0.5;
              const next = exploreZoomWindow(exploreZoom, exploreNorm);
              setExploreNorm(exploreZoomNormForValue(anchorValue, next));
              setExplorePrompt(null);
              setExploreFound(null);
            }}>
              {presetRanges.map((item, index) => (
                <option key={`${item.min}-${item.max}`} value={index}>{formatRangeValue(item.min)} to {formatRangeValue(item.max)}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="nl-zoom-controls" role="group" aria-label="Zoom the explore line">
          <span className="nl-control-label">Zoom</span>
          <div className="nl-zoom-row">
            <button type="button" className="button subtle" onClick={() => zoomExplore(exploreZoom - 1)} disabled={exploreZoom <= 0} aria-label="Zoom out">−</button>
            <label className="nl-zoom-slider">
              <span className="sr-only">Zoom level, 1 shows the whole line, {EXPLORE_ZOOM_LEVELS} the closest view</span>
              <input
                id={exploreZoomSliderId}
                type="range"
                min={1}
                max={EXPLORE_ZOOM_LEVELS}
                step={1}
                value={exploreZoom + 1}
                onChange={(event) => zoomExplore(Number(event.target.value) - 1)}
              />
            </label>
            <button type="button" className="button subtle" onClick={() => zoomExplore(exploreZoom + 1)} disabled={exploreZoom >= EXPLORE_ZOOM_LEVELS - 1} aria-label="Zoom in">+</button>
          </div>
          <p className="microcopy" aria-live="polite">{zoomLabel}</p>
          <div className="nl-zoom-row">
            <button type="button" className="button subtle" onClick={() => panExplore(-1)} aria-label="Pan line left">← Pan</button>
            <button type="button" className="button subtle" onClick={() => panExplore(1)} aria-label="Pan line right">Pan →</button>
          </div>
        </div>

        <div className="nl-explore-prompt" aria-live="polite">
          {explorePrompt === null ? (
            <button type="button" className="button subtle" onClick={newExplorePrompt}>Find this number</button>
          ) : (
            <>
              <span>Find <strong>{formatValue(explorePrompt)}</strong> on this line.</span>
              {exploreFound !== null
                ? <span> Found it — nice estimating.</span>
                : <span> Unscored practice — move the jumper close, or pick a new number.</span>}
              <div className="nl-zoom-row">
                <button type="button" className="button subtle" onClick={newExplorePrompt}>New number</button>
              </div>
            </>
          )}
        </div>

        <div className="nl-track-wrap">
          <div className="nl-labels">
            <span>{formatRangeValue(range.min)}</span>
            <span className="nl-mid-label" aria-hidden="true">{midLabel}</span>
            <span>{formatRangeValue(range.max)}</span>
          </div>
          <div className="nl-tick-row" aria-hidden="true">
            {ticks.majorTicks.map((tick) => (
              <span key={tick} className="nl-tick-label" style={posStyle(exploreZoomNormForValue(tick, range))}>
                {formatValue(tick)}
              </span>
            ))}
          </div>
          <div
            ref={trackRef}
            className="nl-track nl-track-explore"
            role="slider"
            tabIndex={0}
            aria-labelledby={exploreLineId}
            aria-describedby={exploreValueId}
            aria-orientation="horizontal"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(exploreNorm * 100)}
            aria-valuetext={`${ariaValueText(exploreNorm, range)}. ${zoomLabel}`}
            aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown PageUp PageDown Home End"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={(event) => {
              // GAME-5: wheel zoom; discrete steps keep tick math exact.
              event.preventDefault();
              zoomExplore(exploreZoom + (event.deltaY > 0 ? -1 : 1));
            }}
            onKeyDown={onKeyDown}
            style={reduceMotion ? { touchAction: "pan-x pan-y" } : { touchAction: "none" }}
          >
            <span id={exploreLineId} className="sr-only">Explore number line from {formatRangeValue(range.min)} to {formatRangeValue(range.max)}. {zoomLabel}.</span>
            <div className="nl-rail" aria-hidden="true" />
            <div className="nl-mid-tick" aria-hidden="true" />
            {exploreShowHint ? <><div className="nl-quarter-tick nl-quarter-left" aria-hidden="true" /><div className="nl-quarter-tick nl-quarter-right" aria-hidden="true" /></> : null}
            {ticks.majorTicks.map((tick) => {
              const norm = (tick - range.min) / (range.max - range.min);
              return <div key={tick} className="nl-zoom-tick" style={posStyle(norm)} aria-hidden="true" />;
            })}
            <div ref={markerRef} className="nl-marker nl-marker-warmup" style={posStyle(exploreNorm)} aria-hidden="true">
              <span className="nl-jumper-token"><span className="nl-marker-dot" /></span>
              <span className="nl-marker-label">Jumper</span>
            </div>
          </div>
          <p id={exploreValueId} className="sr-only" aria-live="polite">{announce}</p>
          <p className="nl-explore-readout">Jumper at <strong>{readoutValue}</strong> · {Math.round(exploreNorm * 100)}% across the visible line</p>
        </div>

        <div className="demo-controls nl-action-row">
          <button type="button" className="button subtle" aria-pressed={exploreShowHint} onClick={() => setExploreShowHint((value) => !value)}>{exploreShowHint ? "Hide quarter marks" : "Show quarter marks"}</button>
          <button type="button" className="button subtle" onClick={() => setExploreNorm(0.5)}>Reset to midpoint</button>
        </div>
        <p className="microcopy nl-privacy-note">Exploration is untimed, unscored, and session-only.</p>
      </div>
    );
  }

  if (phase === "done" && band) {
    const summary = summarizeRound(trials);
    // Single source of truth for the close-rate display: the
    // session aggregate owns the percent-close math; the summary renders it.
    const aggregates = sessionAggregates({ trials });
    const closeRate = Math.round(aggregates.pctClose ?? 0);
    const bestsLine = visitBestsLine(visitBests);
    const callouts = recordCallouts(visitDelta, summary);
    return (
      <div className="demo-panel closing-copy">
        <div className="eyebrow">Round complete</div>
        <h2 ref={headingRef} tabIndex={-1}>You scored {summary.totalPoints} points.</h2>
        <div className="brief-grid" style={{ textAlign: "left" }}>
          <div className="brief-box"><span>Trials</span><strong>{summary.trials} of {ROUND_MAX_TRIALS}</strong></div>
          <div className="brief-box"><span>Close landings</span><strong>{summary.closeCount} ({closeRate}%)</strong></div>
          <div className="brief-box"><span>Avg. error</span><strong>{formatAverageError(aggregates.avgRelativeError ?? 0)}</strong></div>
          <div className="brief-box"><span>Best avg error this visit</span><strong>{visitBests ? formatAverageError(visitBests.averageError) : "—"}</strong></div>
          <div className="brief-box"><span>Best close streak this visit</span><strong>{visitBests ? visitBests.closeStreak : "—"}</strong></div>
        </div>
        {bestsLine ? <p className="lede nl-visit-bests" style={{ margin: "0 auto 8px", maxWidth: 520 }}>{bestsLine}</p> : null}
        {callouts.length > 0 ? (
          <p className="lede nl-visit-record" style={{ margin: "0 auto 8px", maxWidth: 520 }}>
            {callouts.map((line) => <strong key={line}>{line}</strong>)}
          </p>
        ) : null}
        <p className="lede" style={{ margin: "0 auto 8px", maxWidth: 520 }}>Close streak this round: <strong>{summary.bestStreak}</strong></p>
        <div className="nl-summary-practice"><strong>What you practiced</strong><span>{BAND_META[band].detail}. Use the midpoint first, then adjust.</span></div>
        <div className="nl-summary-insights">
          <strong>Patterns to notice</strong>
          <ul>
            {biasCopy(summary.directionBias) ? <li>{biasCopy(summary.directionBias)}</li> : null}
            {summary.trend === "improving" ? <li>Your last three estimates were closer than your opening attempts.</li> : null}
            {summary.trend === "needs-focus" ? <li>Your last three estimates spread out a little; slow down and rebuild from the midpoint.</li> : null}
            {summary.strongestKind && summary.strongestKindCloseRate !== null ? <li>Your strongest representation was {kindLabel(summary.strongestKind)} ({Math.round(summary.strongestKindCloseRate * 100)}% close).</li> : null}
            {summary.midpointCloseRate !== null ? <li>On midpoint prompts, you were close {Math.round(summary.midpointCloseRate * 100)}% of the time.</li> : null}
            {summary.strongestRange ? <li>Your strongest range was {formatRangeValue(summary.strongestRange.min)} to {formatRangeValue(summary.strongestRange.max)}.</li> : null}
            {summary.directionBias === "unknown" && summary.trend === "unknown" ? <li>Keep looking for the midpoint first; each estimate makes the mental line clearer.</li> : null}
          </ul>
        </div>
        <p className="lede" style={{ margin: "0 auto 22px", maxWidth: 520 }}>{summary.coaching}</p>
        <div className="demo-controls nl-summary-actions" style={{ justifyContent: "center" }}>
          <button type="button" className="button primary" onClick={() => startRound(band)}>Play again</button>
          <button type="button" className="button subtle" onClick={goToSetup}>Change level</button>
          <button type="button" className="link-button" onClick={exitGame}>All games</button>
        </div>
      </div>
    );
  }

  const range = target?.range ?? { min: 0, max: 1 };
  const trueNorm = target ? (target.value - range.min) / (range.max - range.min) : 0.5;
  const midLabel = midpointLabel(range);

  return (
    <div className="demo-panel">
      <div className="demo-status nl-playing-status">
        <span>Number Line Jumper · Score {scoreTotal}</span>
        <div className="nl-status-tools">
          <label className="nl-sound-toggle nl-playing-sound-toggle"><input type="checkbox" checked={soundEnabled} onChange={(event) => setSoundEnabled(event.target.checked)} /><span>Sound</span></label>
          <span className={`timer ${timeLeft <= 10 ? "timer-low" : ""}`}>{timeLeft}s left</span>
        </div>
        <button type="button" className="link-button" onClick={exitGame}>Exit</button>
      </div>
      <HostBreakBadge secondsRemaining={hostBreakSecondsLeft} />
      <div className="progress" aria-hidden="true"><span style={{ width: `${(timeLeft / ROUND_SECONDS) * 100}%` }} /></div>

      <div style={{ marginTop: 22 }}>
        <div className="eyebrow">Estimate the magnitude</div>
        <h2 ref={headingRef} tabIndex={-1}>Land on {target?.display ?? "…"}</h2>
        <p className="microcopy" style={{ marginTop: 4 }}>Trial {Math.min(targetIndex + 1, ROUND_MAX_TRIALS)} of {ROUND_MAX_TRIALS} · place the jumper, then press Land</p>
      </div>

      <div className="nl-track-wrap">
        <div className="nl-labels"><span>{formatRangeValue(range.min)}</span><span className="nl-mid-label" aria-hidden="true">{midLabel}</span><span>{formatRangeValue(range.max)}</span></div>
        <div
          ref={trackRef}
          className={`nl-track ${committed ? "nl-track-locked" : ""}`}
          role="slider"
          tabIndex={committed ? -1 : 0}
          aria-labelledby={lineId}
          aria-describedby={valueId}
          aria-orientation="horizontal"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(markerNorm * 100)}
          aria-valuetext={ariaValueText(markerNorm, range)}
          aria-disabled={committed}
          aria-keyshortcuts="ArrowLeft ArrowRight Home End Enter Space"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
          style={{ touchAction: "none" }}
        >
          <span id={lineId} className="sr-only">Number line from {formatRangeValue(range.min)} to {formatRangeValue(range.max)}. Place your estimate, then activate Land here.</span>
          <div className="nl-rail" aria-hidden="true" />
          <div className="nl-mid-tick" aria-hidden="true" />
          {showHint ? <><div className="nl-quarter-tick nl-quarter-left" aria-hidden="true" /><div className="nl-quarter-tick nl-quarter-right" aria-hidden="true" /></> : null}
          <div ref={markerRef} className={`nl-marker ${committed && lastScore ? `nl-marker-${lastScore.closeness} nl-marker-reveal` : ""}`} style={posStyle(markerNorm)} aria-hidden="true">
            <span className="nl-jumper-token"><span className="nl-marker-dot" /></span>
            {committed ? <span className="nl-marker-label">Your estimate</span> : null}
          </div>
          {committed && target ? <div className="nl-truth nl-truth-reveal" style={posStyle(trueNorm)} aria-hidden="true"><span className="nl-truth-flag">{target.display}</span></div> : null}
        </div>
        <p id={valueId} className="sr-only" aria-live="polite">{announce}</p>
      </div>

      {lastScore && committed ? (
        <div ref={feedbackRef} tabIndex={-1} className={`feedback nl-feedback nl-feedback-${lastScore.closeness}`} role="status">
          <strong>{lastScore.feedback}</strong>
          <p className="nl-feedback-coaching">You placed about {formatValue(lastScore.playerValue)} — {formatPct(lastScore.error)} away ({formatValue(lastScore.absoluteError)} units).</p>
          <div className="nl-feedback-grid"><span>Your estimate <strong>{formatValue(lastScore.playerValue)}</strong></span><span>Target <strong>{target?.display ?? formatValue(lastScore.targetValue)}</strong></span></div>
          <span>Off by {formatPct(lastScore.error)} · +{lastScore.points} points</span>
          <span className="nl-feedback-next"><strong>Try this next time:</strong> {lastScore.nextStep}</span>
        </div>
      ) : (
        <div className="demo-controls nl-action-row" style={{ marginTop: 18 }}>
          <button type="button" className="button primary" onClick={commit} disabled={!target}>Land here</button>
          <button type="button" className="button subtle" aria-pressed={showHint} onClick={() => setShowHint((value) => !value)}>{showHint ? "Hide midpoint hint" : "Show midpoint hint"}</button>
          <span className="microcopy nl-keyboard-help" style={{ margin: 0 }}>Arrows move · Enter lands · Shift for bigger steps</span>
        </div>
      )}

      {showHint && !committed && target ? <p className="nl-hint" role="note">{hintForTarget(target, midLabel)}</p> : null}
      <p className="microcopy nl-privacy-note">Session-only play — nothing about you is saved.</p>
    </div>
  );
}
