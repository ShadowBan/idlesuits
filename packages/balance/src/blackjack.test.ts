import { describe, expect, it } from 'vitest';
import { FREE_BET_RULES, solveStrategy } from '@idlesuits/sim';
import { bjEdge, runBjBatch } from './blackjack';

// Published figure for Free Bet Blackjack: 1.04% house edge (wizardofodds.com).
describe('matches the published house edge', () => {
  it('loses about 1.04% of each bet under solved strategy', () => {
    const stats = runBjBatch({
      tables: solveStrategy(FREE_BET_RULES),
      runSeed: 'published',
      hands: 400_000,
    });
    // A round swings ~1.15 bets, so 400k rounds place the edge within ~0.36%.
    expect(Math.abs(-bjEdge(stats) - 0.0104)).toBeLessThan(0.004);
    // Free bets should be a visible part of the game, not a rounding error.
    expect(stats.freeWon).toBeGreaterThan(stats.rounds * 0.02);
  });
});
