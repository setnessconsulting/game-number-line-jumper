/** Optional, quiet, session-only sound cues for Number Line Jumper. */

import { closenessFromError } from "@/lib/numberLineJumper/engine";

export type SoundCue = "start" | "exact" | "close" | "far" | "finish";

type AudioContextRef = { current: AudioContext | null };
type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

/** Frequencies (Hz) per cue. Closeness tiers step downward in pitch: exact (C5→E5) > close (G4→A4) > far (A3). */
export const CUE_NOTES: Record<SoundCue, readonly number[]> = {
  start: [392, 523.25],
  exact: [523.25, 659.25],
  close: [392, 440],
  far: [220],
  finish: [523.25, 659.25, 783.99],
};

/**
 * Deterministic, monotonic pitch mapping from the product's established
 * relative-error tiers (≤5% exact, ≤15% close, otherwise far) to a cue.
 * Closer answers get the higher, clearer closeness pitch. The tier itself
 * comes from the engine's single classifier so the cue always agrees with
 * the closeness shown on screen, including at threshold boundaries.
 */
export function soundCueForError(error: number): SoundCue {
  return closenessFromError(error);
}

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextConstructor =
    window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
  if (!AudioContextConstructor) return null;
  try {
    return new AudioContextConstructor();
  } catch {
    return null;
  }
}

/** Play a tiny cue only after an explicit user opt-in. Never throws into the game. */
export function playSoundCue(contextRef: AudioContextRef, cue: SoundCue): void {
  const context = contextRef.current ?? getContext();
  if (!context) return;
  contextRef.current = context;

  try {
    const notes = CUE_NOTES[cue];
    const start = context.currentTime;
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const noteStart = start + index * 0.06;
      const noteEnd = noteStart + (cue === "far" ? 0.12 : 0.16);

      oscillator.type = cue === "far" ? "triangle" : "sine";
      oscillator.frequency.setValueAtTime(frequency, noteStart);
      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.exponentialRampToValueAtTime(0.045, noteStart + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(noteStart);
      oscillator.stop(noteEnd);
    });

    void context.resume().catch(() => undefined);
  } catch {
    // Audio is an optional enhancement; a blocked or unavailable context is safe to ignore.
  }
}

export function closeSoundContext(contextRef: AudioContextRef): void {
  const context = contextRef.current;
  contextRef.current = null;
  if (context) void context.close().catch(() => undefined);
}
