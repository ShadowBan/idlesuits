import { describe, expect, it } from 'vitest';
import { FLUSH_RUSH, lookupScale, STUD_THREE_CARD, UTH_HOLE_CARD } from '@idlesuits/sim';
import { chanceOfFreeBet } from './blackjack-exact';
import { holeCardCounts, suitsCounts, threeCardCounts } from './exact';
import { PUBLISHED } from './published';

// The quick exact checks from `npm run audit`; the slow ones (Trips, 6-Card, the
// whole of Mississippi Stud) only run there.
describe('exact odds match the published hand counts', () => {
  it('Flush Rush: every flush size, and the 7.53% edge', () => {
    const { flushSize } = suitsCounts();
    for (const [size, n] of Object.entries(PUBLISHED.flushRush.combos)) expect(flushSize[size]).toBe(n);
    let ev = 0;
    for (const [size, n] of Object.entries(flushSize)) {
      const pays = lookupScale(FLUSH_RUSH.pays, Number(size));
      ev += (pays > 0 ? pays : -1) * n;
    }
    expect(-ev / 133784560).toBeCloseTo(PUBLISHED.flushRush.edge, 6);
    expect(FLUSH_RUSH.edge).toBeCloseTo(PUBLISHED.flushRush.edge, 6);
  });

  it('Hole Card Bonus and the 3-Card Bonus, line by line', () => {
    expect(holeCardCounts()).toEqual(PUBLISHED.holeCard.combos);
    expect(threeCardCounts()).toEqual(PUBLISHED.threeCard.combos);
    expect(UTH_HOLE_CARD.rows.map((r) => r.label)).toEqual(Object.keys(PUBLISHED.holeCard.combos).slice(0, -1));
    expect(STUD_THREE_CARD.edge).toBeCloseTo(PUBLISHED.threeCard.edge, 10);
  });

  it('a Free Bet round earns a free bet 16.18% of the time', () => {
    expect(chanceOfFreeBet()).toBeCloseTo(0.16177, 5);
  });
});
