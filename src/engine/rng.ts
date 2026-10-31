/**
 * Pure deterministic Random Number Generator (Mulberry32) for the Football Match Engine.
 * Supports state inspection and restoration so step-by-step simulation is 100% reproducible.
 */

export interface SeededRng {
  /** Returns a pseudo-random float in [0, 1) */
  next(): number;
  /** Returns a float in [min, max) */
  nextFloat(min: number, max: number): number;
  /** Returns an integer in [min, max] inclusive */
  nextInt(min: number, max: number): number;
  /** Returns true with probability p in [0, 1] */
  chance(probability: number): boolean;
  /** Picks an element from a non-empty array using positive weights */
  pickWeighted<T>(items: readonly T[], weightFn: (item: T) => number): T;
  /** Inspects current internal 32-bit state */
  getState(): number;
  /** Restores internal 32-bit state */
  setState(newState: number): void;
}

/**
 * Hashes any string or number seed into a non-zero 32-bit unsigned integer (FNV-1a).
 */
export function normalizeSeed(seed: number | string): number {
  const str = String(seed ?? "default-fm-seed");
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) || 0x9e3779b9;
}

/**
 * Creates a stateful Mulberry32 PRNG object from a seed or existing 32-bit state.
 */
export function createStatefulRng(
  seedOrState: number | string,
  isRawState = false
): SeededRng {
  let state = isRawState
    ? (Number(seedOrState) | 0) || 0x9e3779b9
    : normalizeSeed(seedOrState);

  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    nextFloat(min: number, max: number): number {
      return min + next() * (max - min);
    },
    nextInt(min: number, max: number): number {
      const lo = Math.ceil(Math.min(min, max));
      const hi = Math.floor(Math.max(min, max));
      return Math.floor(lo + next() * (hi - lo + 1));
    },
    chance(probability: number): boolean {
      if (probability <= 0) return false;
      if (probability >= 1) return true;
      return next() < probability;
    },
    pickWeighted<T>(items: readonly T[], weightFn: (item: T) => number): T {
      if (items.length === 0) {
        throw new Error("pickWeighted requires a non-empty array");
      }
      const weights = items.map((item) => Math.max(0.001, weightFn(item)));
      const total = weights.reduce((acc, w) => acc + w, 0);
      let threshold = next() * total;
      for (let i = 0; i < items.length; i++) {
        threshold -= weights[i];
        if (threshold <= 0) {
          return items[i];
        }
      }
      return items[items.length - 1];
    },
    getState(): number {
      return state;
    },
    setState(newState: number): void {
      state = newState | 0;
    },
  };
}

/**
 * Backward-compatible function returning a closure `() => number` in [0, 1).
 */
export function createSeededRng(seed: number | string): () => number {
  const rng = createStatefulRng(seed);
  return () => rng.next();
}
