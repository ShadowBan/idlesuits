import { describe, expect, it } from 'vitest';
import {
  BACCARAT_BONUSES,
  BACCARAT_RULES,
  bankerDraws,
  shuffleShoe,
  cutCardOut,
  simulateBaccaratRound,
  type Card,
} from '../src';

const card = (rank: number, i: number): Card => ({ uid: `c${i}`, suit: 'S', rank, source: 'player' } as Card);
/** Player, Banker, Player, Banker, then the third cards. */
const stacked = (ranks: number[]) => ({ cards: ranks.map(card), next: 0 });
const play = (ranks: number[], side: 'player' | 'banker' = 'banker', bonuses?: Record<string, number>) =>
  simulateBaccaratRound({ seed: { run: 't', round: 0 }, side, bonuses, shoe: stacked(ranks) });

describe('the tableau', () => {
  it('stands both hands on a natural', () => {
    const r = play([9, 2, 13, 3]); // Player 9, Banker 5
    expect(r.player).toHaveLength(2);
    expect(r.banker).toHaveLength(2);
    expect(r).toMatchObject({ natural: true, winner: 'player', playerTotal: 9, bankerTotal: 5, main: -1 });
  });

  it('draws the Player on 0-5 and stands on 6-7', () => {
    expect(play([2, 10, 3, 10, 4, 7]).player).toHaveLength(3); // Player 5 draws
    expect(play([3, 10, 3, 10, 9]).player).toHaveLength(2); // Player 6 stands; Banker 0 draws
  });

  it("follows the Banker's third-card rules", () => {
    expect(bankerDraws(3, 8)).toBe(false);
    expect(bankerDraws(3, 9)).toBe(true);
    expect(bankerDraws(4, 1)).toBe(false);
    expect(bankerDraws(4, 2)).toBe(true);
    expect(bankerDraws(5, 3)).toBe(false);
    expect(bankerDraws(5, 4)).toBe(true);
    expect(bankerDraws(6, null)).toBe(false);
    expect(bankerDraws(6, 6)).toBe(true);
    expect(bankerDraws(7, 6)).toBe(false);
    expect(bankerDraws(5, null)).toBe(true);
  });

  it('pays Banker less commission, pushes ties, and settles the side bets', () => {
    const banker = play([13, 4, 12, 3, 10, 2]); // Player 0 draws 10 (0); Banker 7 stands
    expect(banker).toMatchObject({ winner: 'banker', main: 1 - BACCARAT_RULES.commission });
    const tie = play([4, 4, 3, 3], 'player', { tie: 1, playerPair: 1, bankerPair: 1 }); // 7 and 7, no draws
    expect(tie.winner).toBe('tie');
    expect(tie.main).toBe(0);
    expect(tie.bonuses.map((b) => b.net)).toEqual([-1, 8, -1]);
    expect(play([5, 6, 5, 6, 10, 10], 'player', { playerPair: 1, bankerPair: 2 }).bonuses.map((b) => b.net)).toEqual([11, 22]);
  });
});

/** Every way the cards can fall, by value, from an eight-deck shoe: the exact chance of each result. */
function exact(decks = 8) {
  const counts = [16 * decks, ...Array(9).fill(4 * decks)] as number[];
  let left = 52 * decks;
  const p = { player: 0, banker: 0, tie: 0 };
  const take = (weight: number, fn: (v: number, w: number) => void) => {
    for (let v = 0; v < 10; v++) {
      if (!counts[v]) continue;
      const w = (weight * counts[v]!) / left;
      counts[v]!--;
      left--;
      fn(v, w);
      counts[v]!++;
      left++;
    }
  };
  const finish = (pt: number, bt: number, w: number) => {
    if (pt > bt) p.player += w;
    else if (bt > pt) p.banker += w;
    else p.tie += w;
  };
  take(1, (p1, w1) =>
    take(w1, (b1, w2) =>
      take(w2, (p2, w3) =>
        take(w3, (b2, w4) => {
          const pt = (p1 + p2) % 10;
          const bt = (b1 + b2) % 10;
          if (pt >= 8 || bt >= 8) return finish(pt, bt, w4);
          if (pt <= 5) {
            take(w4, (p3, w5) => {
              const pt3 = (pt + p3) % 10;
              if (bankerDraws(bt, p3)) take(w5, (b3, w6) => finish(pt3, (bt + b3) % 10, w6));
              else finish(pt3, bt, w5);
            });
          } else if (bankerDraws(bt, null)) take(w4, (b3, w5) => finish(pt, (bt + b3) % 10, w5));
          else finish(pt, bt, w4);
        }),
      ),
    ),
  );
  return p;
}

describe('the odds', () => {
  const p = exact();

  it('gives the published house edges exactly', () => {
    const banker = p.banker * (1 - BACCARAT_RULES.commission) - p.player;
    const player = p.player - p.banker;
    expect(-banker).toBeCloseTo(0.010579, 5);
    expect(-player).toBeCloseTo(0.012351, 5);
    const tie = BACCARAT_BONUSES.find((b) => b.id === 'tie')!;
    expect(-(p.tie * 8 - (1 - p.tie))).toBeCloseTo(tie.edge, 5);
    const pair = 31 / 415;
    expect(-(pair * 11 - (1 - pair))).toBeCloseTo(BACCARAT_BONUSES.find((b) => b.id === 'playerPair')!.edge, 5);
  });

  it('deals winners at those odds, round after round', () => {
    const n = 200_000;
    const seen = { player: 0, banker: 0, tie: 0 };
    for (let round = 0; round < n; round++) seen[simulateBaccaratRound({ seed: { run: 'odds', round }, side: 'banker' }).winner]++;
    for (const k of ['player', 'banker', 'tie'] as const) {
      const sd = Math.sqrt((p[k] * (1 - p[k])) / n);
      expect(Math.abs(seen[k] / n - p[k]), k).toBeLessThan(4 * sd);
    }
  });

  it('deals a whole shoe down to the cut card', () => {
    const shoe = shuffleShoe(8, ['bac', 0]);
    let coups = 0;
    while (!cutCardOut(shoe)) {
      shoe.next += simulateBaccaratRound({ seed: { run: 'x', round: coups }, side: 'banker', shoe }).cardsUsed;
      coups++;
    }
    // About 4.94 cards a coup over three quarters of eight decks.
    expect(coups).toBeGreaterThan(55);
    expect(coups).toBeLessThan(80);
  });
});
