import { describe, expect, it } from 'vitest';
import {
  Category,
  decideUth,
  PREFLOP_CHART,
  riverOdds,
  simulateUthRound,
  standardDeck,
  startingHandKey,
  UTH_BONUSES,
  UTH_RULES,
  type Card,
  type Suit,
  type UthDecision,
} from '../src';

const deck = standardDeck('player');
const strategy = { chart: PREFLOP_CHART };
const RANKS: Record<string, number> = { T: 10, J: 11, Q: 12, K: 13, A: 14 };
const cards = (spec: string): Card[] =>
  spec.split(' ').map((c, i) => ({
    uid: `t${i}${c}`,
    rank: RANKS[c.slice(0, -1)] ?? Number(c.slice(0, -1)),
    suit: c.slice(-1) as Suit,
    source: 'player' as const,
  }));

const play = (
  round: number,
  decide = (d: UthDecision) => decideUth(strategy, d, deck),
  bonuses: Record<string, number> = {},
) => simulateUthRound({ seed: { run: 'uth-test', round }, decide, bonuses, recordEvents: true });

describe('starting hands', () => {
  it('names pairs, suited and offsuit holdings', () => {
    expect(startingHandKey(cards('AS KS'))).toBe('AKs');
    expect(startingHandKey(cards('KD AS'))).toBe('AKo');
    expect(startingHandKey(cards('7C 7D'))).toBe('77');
  });

  it('raises the hands every published chart raises, and checks the trash', () => {
    for (const hand of ['AA', 'AKs', 'A2o', 'K2s', 'Q8o', '33']) expect(PREFLOP_CHART[hand]).toBe(true);
    for (const hand of ['72o', '32o', '22', 'J2o']) expect(PREFLOP_CHART[hand]).toBeFalsy();
  });
});

describe('simulateUthRound settlement', () => {
  it('replays identically from the same seed', () => {
    expect(play(11)).toEqual(play(11));
  });

  it('a fold loses the ante and blind, and nothing else', () => {
    let folds = 0;
    for (let round = 0; round < 3000; round++) {
      const r = play(round);
      if (!r.folded) continue;
      folds++;
      expect(r.parts).toEqual({ ante: -1, play: 0, blind: -1, bonus: 0 });
    }
    expect(folds).toBeGreaterThan(300);
  });

  it('pushes the ante whenever the dealer fails to open', () => {
    let seen = 0;
    for (let round = 0; round < 3000; round++) {
      const r = play(round);
      if (r.folded || r.dealerQualified) continue;
      seen++;
      expect(r.parts.ante).toBe(0);
      expect(r.dealerHand.category).toBe(Category.HighCard);
    }
    expect(seen).toBeGreaterThan(200);
  });

  it('pays the blind only on a winning straight or better', () => {
    for (let round = 0; round < 4000; round++) {
      const r = play(round);
      if (r.folded) continue;
      const won = r.playerHand.score > r.dealerHand.score;
      const lost = r.playerHand.score < r.dealerHand.score;
      const table = UTH_RULES.blindPays[r.playerHand.category] ?? 0;
      expect(r.parts.blind).toBe(won ? table : lost ? -1 : 0);
      expect(r.parts.play).toBe(won ? r.play : lost ? -r.play : 0);
    }
  });

  it('settles every side bet even after a fold, without changing the main game', () => {
    const all = { trips: 1, sixCard: 1, holeCard: 1, badBeat: 1 };
    let foldedWins = 0;
    for (let round = 0; round < 3000; round++) {
      const plain = play(round);
      const r = play(round, undefined, all);
      expect(r.bonuses.map((b) => b.id)).toEqual(Object.keys(all));
      for (const bonus of r.bonuses) {
        const bet = UTH_BONUSES.find((b) => b.id === bonus.id)!;
        expect(bonus.net).toBe(bonus.row < 0 ? -1 : bet.rows[bonus.row]!.pays);
        if (r.folded && bonus.row >= 0) foldedWins++;
      }
      expect({ ...r.parts, bonus: 0 }).toEqual(plain.parts);
      expect(r.net).toBe(plain.net + r.parts.bonus);
    }
    expect(foldedWins).toBeGreaterThan(0);
  });

  it('only allows one play bet, sized for the street it was made on', () => {
    for (let round = 0; round < 2000; round++) {
      const r = play(round);
      const played = r.events.filter((e) => e.type === 'Played');
      expect(played.length).toBeLessThanOrEqual(1);
      const bet = played[0];
      if (bet?.type === 'Played') {
        expect(bet.raise).toBe(bet.street === 'preflop' ? 4 : bet.street === 'flop' ? 2 : 1);
      }
    }
  });
});

describe('riverOdds', () => {
  it('knows the nuts cannot lose', () => {
    const odds = riverOdds(cards('AS KS'), cards('QS JS TS 2D 3C'), deck);
    expect(odds.combinations).toBe(990);
    expect(odds.beats).toBe(0);
    expect(odds.ev).toBeGreaterThan(1);
  });

  it('folds a hand that loses to most of the deck', () => {
    // Seven-high on a board where any pair beats you.
    const decision: UthDecision = {
      street: 'river',
      hole: cards('2C 3D'),
      board: cards('KS QH 9D 8C 5S'),
      raises: [1],
      canCheck: false,
      canFold: true,
    };
    expect(decideUth(strategy, decision, deck).move).toBe('fold');
  });
});
