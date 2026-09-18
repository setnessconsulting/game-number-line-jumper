/**
 * Shared deterministic PRNG used by the game's mathematical engine.
 * Number Line Jumper re-exports this helper so callers use one algorithm.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [min, max] inclusive, drawn from rng. */
export function pickInt(rng: () => number, minInclusive: number, maxInclusive: number): number {
  const span = maxInclusive - minInclusive + 1;
  return minInclusive + Math.floor(rng() * span);
}

/** Element from a non-empty list, drawn from rng. */
export function pickFrom<T>(rng: () => number, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length)!]!;
}

/** Fisher–Yates shuffle returning a new array (rng-injected, deterministic). */
export function shuffled<T>(rng: () => number, list: readonly T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}
