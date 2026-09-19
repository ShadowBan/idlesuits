import { describe, expect, it } from 'vitest';
import { buildShoe, DEFAULT_RULES, OPTIMAL_BASE_POLICY, standardDeck } from '@idlesuits/sim';
import { mainEdge, runBatch, sideBetEdge } from './batch';

// Published figures for I Luv Suits / High Card Flush on a standard deck (wizardofodds.com).
describe('matches published base-game math', () => {
  const stats = runBatch({
    shoe: buildShoe(standardDeck('player')),
    seat: { raisePolicy: OPTIMAL_BASE_POLICY, sideBets: { flushRush: 1, superFlushRush: 1 } },
    rules: DEFAULT_RULES,
    runSeed: 'published',
    dealerId: 'standard',
    hands: 400_000,
  });
  const freq = (size: number) => (stats.playerFlush[size] ?? 0) / stats.hands;

  it('flush size distribution', () => {
    expect(freq(4)).toBeCloseTo(0.19537, 2);
    expect(freq(5)).toBeCloseTo(0.028514, 2);
    expect(freq(6)).toBeCloseTo(0.002001, 3);
  });

  it('main game house edge of 2.64%', () => {
    expect(Math.abs(mainEdge(stats) - -0.0264)).toBeLessThan(0.008);
  });

  it('Flush Rush house edge of 7.53%', () => {
    expect(Math.abs(sideBetEdge(stats.sideBets.flushRush!) - -0.0753)).toBeLessThan(0.025);
  });
});
