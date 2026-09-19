import type { Rank } from './cards';
import { compareFlush, type HandEval } from './evaluate';

/** How a seat decides its raise. Data, so it can be saved and edited in the UI. */
export type RaisePolicy =
  /** Max raise with `minSize`+ flushes; at exactly `threshold.length` cards, max raise if at least `threshold`. */
  | { kind: 'threshold'; minSize: number; threshold: Rank[] }
  /**
   * Raise per flush size (clamped to the cap). A size with no entry uses the
   * largest listed size below it, so `6` also covers 7+. Hands of exactly
   * `minRanks.length` cards fold unless they reach `minRanks`.
   */
  | { kind: 'bySize'; raises: Record<number, number>; minRanks?: Rank[] }
  /** A decision already made, e.g. by the player clicking a button. */
  | { kind: 'fixed'; raise: number }
  | { kind: 'alwaysMax' };

/**
 * Near-optimal for the base game: raise max with 4+, and 3-card flushes 10-8-6 or better.
 * Found by sweeping thresholds; reproduces the published 2.64% house edge and 32.1% fold rate.
 */
export const OPTIMAL_BASE_POLICY: RaisePolicy = { kind: 'threshold', minSize: 4, threshold: [10, 8, 6] };

/** Returns the raise in antes; 0 means fold. */
export function decideRaise(policy: RaisePolicy, hand: HandEval, cap: number): number {
  switch (policy.kind) {
    case 'alwaysMax':
      return cap;
    case 'fixed':
      return Math.max(0, Math.min(cap, policy.raise));
    case 'bySize': {
      const { minRanks } = policy;
      if (minRanks && hand.size === minRanks.length && compareFlush(hand, { size: hand.size, ranks: minRanks }) < 0) return 0;
      const sizes = Object.keys(policy.raises).map(Number).filter((n) => n <= hand.size);
      if (sizes.length === 0) return 0;
      return Math.min(cap, policy.raises[Math.max(...sizes)]!);
    }
    case 'threshold': {
      if (hand.size >= policy.minSize) return cap;
      if (hand.size !== policy.threshold.length) return 0;
      const beats = compareFlush(hand, { size: hand.size, ranks: policy.threshold }) >= 0;
      return beats ? cap : 0;
    }
  }
}
