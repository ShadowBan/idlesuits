import type { Rank } from './cards';
import { compareFlush, type HandEval } from './evaluate';

/** How a seat decides its raise. Data, so it can be saved and edited in the UI. */
export type RaisePolicy =
  /** Max raise with `minSize`+ flushes; at exactly `threshold.length` cards, max raise if at least `threshold`. */
  | { kind: 'threshold'; minSize: number; threshold: Rank[] }
  /** Fixed multiplier per flush size (clamped to the cap); missing sizes fold. */
  | { kind: 'bySize'; raises: Record<number, number> }
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
    case 'bySize':
      return Math.min(cap, policy.raises[hand.size] ?? 0);
    case 'threshold': {
      if (hand.size >= policy.minSize) return cap;
      if (hand.size !== policy.threshold.length) return 0;
      const beats = compareFlush(hand, { size: hand.size, ranks: policy.threshold }) >= 0;
      return beats ? cap : 0;
    }
  }
}
