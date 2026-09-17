import { afterEach, describe, expect, it, vi } from "vitest";
import { CLOSE_THRESHOLD, EXACT_THRESHOLD, scorePlacement } from "@/lib/numberLineJumper/engine";
import { closeSoundContext, CUE_NOTES, playSoundCue, soundCueForError, type SoundCue } from "@/lib/numberLineJumper/sound";
import type { Target } from "@/lib/numberLineJumper/types";

// ---------------------------------------------------------------------------
// Error-tier mapping (LEVELBEST-58)
// ---------------------------------------------------------------------------

describe("soundCueForError tier boundaries", () => {
  it("classifies exactly 5% as the exact/closest tier", () => {
    expect(soundCueForError(0.05)).toBe("exact");
  });

  it("classifies just over 5% as the close tier", () => {
    expect(soundCueForError(0.05 + 1e-9)).toBe("close");
    expect(soundCueForError(0.051)).toBe("close");
  });

  it("classifies exactly 15% as the close tier", () => {
    expect(soundCueForError(0.15)).toBe("close");
  });

  it("classifies just over 15% as the far tier", () => {
    expect(soundCueForError(0.15 + 1e-9)).toBe("far");
    expect(soundCueForError(0.151)).toBe("far");
  });

  it("classifies a representative very-close value as exact", () => {
    expect(soundCueForError(0)).toBe("exact");
    expect(soundCueForError(0.01)).toBe("exact");
  });

  it("classifies a representative far value as far", () => {
    expect(soundCueForError(0.5)).toBe("far");
    expect(soundCueForError(1)).toBe("far");
  });

  it("shares the engine's closeness thresholds", () => {
    expect(EXACT_THRESHOLD).toBe(0.05);
    expect(CLOSE_THRESHOLD).toBe(0.15);
  });
});

describe("soundCueForError monotonicity", () => {
  const CUE_RANK: Record<SoundCue, number> = { exact: 2, close: 1, far: 0, start: 2, finish: 2 };

  it("never raises the closeness pitch as error grows", () => {
    let previous = CUE_RANK[soundCueForError(0)];
    for (let error = 0; error <= 1.0001; error += 0.005) {
      const rank = CUE_RANK[soundCueForError(error)];
      expect(rank).toBeLessThanOrEqual(previous);
      previous = rank;
    }
  });

  it("is deterministic for the same error", () => {
    for (const error of [0, 0.05, 0.1, 0.15, 0.2, 0.9]) {
      const first = soundCueForError(error);
      for (let i = 0; i < 5; i += 1) expect(soundCueForError(error)).toBe(first);
    }
  });

  it("keeps cue pitch ordered: exact above close above far", () => {
    const peak = (cue: SoundCue) => Math.max(...CUE_NOTES[cue]);
    const low = (cue: SoundCue) => Math.min(...CUE_NOTES[cue]);
    expect(peak("exact")).toBeGreaterThan(peak("close"));
    expect(peak("close")).toBeGreaterThan(peak("far"));
    expect(low("exact")).toBeGreaterThan(low("far"));
  });

  it("agrees with the engine's closeness classification on scored placements", () => {
    const target: Target = {
      value: 50,
      display: "50",
      kind: "whole",
      range: { min: 0, max: 100 },
    };
    const fromCloseness: Record<string, SoundCue> = { exact: "exact", close: "close", far: "far" };
    for (let norm = 0; norm <= 1.0001; norm += 0.01) {
      const score = scorePlacement(norm, target);
      expect(soundCueForError(score.error)).toBe(fromCloseness[score.closeness]);
    }
  });
});

// ---------------------------------------------------------------------------
// WebAudio lifecycle
// ---------------------------------------------------------------------------

const audioTrace = {
  instances: [] as FakeAudioContext[],
  notes: [] as number[],
  gains: [] as number[],
  durations: [] as number[],
};

function resetAudioTrace(): void {
  audioTrace.instances = [];
  audioTrace.notes = [];
  audioTrace.gains = [];
  audioTrace.durations = [];
}

class FakeAudioContext {
  currentTime = 0;
  destination = {};
  closed = false;

  constructor() {
    audioTrace.instances.push(this);
  }

  createOscillator() {
    let startAt = 0;
    return {
      type: "",
      frequency: {
        setValueAtTime: (value: number) => {
          audioTrace.notes.push(value);
        },
      },
      connect: () => undefined,
      start: (when: number) => {
        startAt = when;
      },
      stop: (when: number) => {
        audioTrace.durations.push(when - startAt);
      },
    };
  }

  createGain() {
    return {
      gain: {
        setValueAtTime: (value: number) => {
          audioTrace.gains.push(value);
        },
        exponentialRampToValueAtTime: (value: number) => {
          audioTrace.gains.push(value);
        },
      },
      connect: () => undefined,
    };
  }

  resume() {
    return Promise.resolve();
  }

  close() {
    this.closed = true;
    return Promise.resolve();
  }
}

function stubAudio(): void {
  vi.stubGlobal("window", { AudioContext: FakeAudioContext });
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetAudioTrace();
});

describe("playSoundCue lifecycle", () => {
  it("creates no audio context until a cue is requested", () => {
    stubAudio();
    soundCueForError(0.02);
    expect(audioTrace.instances).toHaveLength(0);
    expect(audioTrace.notes).toEqual([]);
  });

  it("reuses one context across cues and plays the mapped notes", () => {
    stubAudio();
    const ref = { current: null as AudioContext | null };
    playSoundCue(ref, "exact");
    playSoundCue(ref, "far");
    playSoundCue(ref, "finish");
    expect(audioTrace.instances).toHaveLength(1);
    expect(ref.current).toBe(audioTrace.instances[0]);
    expect(audioTrace.notes).toEqual([...CUE_NOTES.exact, ...CUE_NOTES.far, ...CUE_NOTES.finish]);
  });

  it("closes and clears the context, then builds a fresh one on demand", () => {
    stubAudio();
    const ref = { current: null as AudioContext | null };
    playSoundCue(ref, "exact");
    const first = audioTrace.instances[0];
    expect(ref.current).toBe(first);
    closeSoundContext(ref);
    expect(ref.current).toBeNull();
    expect(first.closed).toBe(true);

    playSoundCue(ref, "close");
    expect(audioTrace.instances).toHaveLength(2);
    expect(ref.current).not.toBe(first);
  });

  it("stays silent without an available AudioContext", () => {
    const ref = { current: null as AudioContext | null };
    expect(() => playSoundCue(ref, "exact")).not.toThrow();
    expect(ref.current).toBeNull();
  });

  it("keeps cues quiet, short, and free of music-length layering", () => {
    stubAudio();
    const ref = { current: null as AudioContext | null };
    for (const cue of ["exact", "close", "far", "start", "finish"] as const) {
      playSoundCue(ref, cue);
    }
    // Quiet: peak gain stays at the existing design level (0.045).
    expect(Math.max(...audioTrace.gains)).toBeLessThanOrEqual(0.045);
    // Short: every note is at most 0.16 s (epsilon guards float summation).
    expect(Math.max(...audioTrace.durations)).toBeLessThanOrEqual(0.16 + 1e-9);
    // 1-2 notes per closeness/start cue, 3 for finish — never a music loop.
    const expected = [CUE_NOTES.exact, CUE_NOTES.close, CUE_NOTES.far, CUE_NOTES.start, CUE_NOTES.finish];
    expect(audioTrace.notes).toHaveLength(expected.reduce((sum, notes) => sum + notes.length, 0));
  });
});
