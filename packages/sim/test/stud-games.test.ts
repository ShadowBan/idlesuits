import { describe, expect, it } from 'vitest';
import {
  bestFour,
  C4P_QUEENS_UP,
  decideC4p,
  decideCsp,
  decideLir,
  decideDj,
  DJ_BAD_BEAT,
  DJ_CATEGORY_NAMES,
  DJ_RULES,
  djCategoryOf,
  djIsNatural,
  djScore,
  simulateDjRound,
  fourCardScore,
  fourCategoryOf,
  FourCategory,
  LIR_FIVE_CARD,
  simulateC4pRound,
  simulateCspRound,
  simulateLirRound,
  superBonusPays,
  type Card,
  type Suit,
} from '../src';

const RANKS: Record<string, number> = { T: 10, J: 11, Q: 12, K: 13, A: 14 };
const cards = (spec: string): Card[] =>
  spec.split(' ').map((c, i) =>
    c === 'W'
      ? { uid: `t${i}W`, rank: 14, suit: 'S' as Suit, source: 'player' as const, joker: true }
      : {
          uid: `t${i}${c}`,
          rank: RANKS[c.slice(0, -1)] ?? Number(c.slice(0, -1)),
          suit: c.slice(-1) as Suit,
          source: 'player' as const,
        },
  );

describe('four-card hands', () => {
  const category = (spec: string) => fourCategoryOf(fourCardScore(cards(spec)));
  it('ranks three of a kind above a flush and a straight, as Crazy 4 Poker does', () => {
    expect(category('7S 7D 7H 2C')).toBe(FourCategory.Trips);
    expect(fourCardScore(cards('7S 7D 7H 2C'))).toBeGreaterThan(fourCardScore(cards('2S 7S 9S KS')));
    expect(fourCardScore(cards('2S 7S 9S KS'))).toBeGreaterThan(fourCardScore(cards('JS QD KH AC')));
    expect(category('AS 2D 3H 4C')).toBe(FourCategory.Straight);
    expect(category('QS KD AH 2C')).toBe(FourCategory.HighCard);
  });
  it('finds the best four of five', () => {
    const { score, discard } = bestFour(cards('9S 9D 9H 9C 2S'));
    expect(fourCategoryOf(score)).toBe(FourCategory.Quads);
    expect(discard).toBe(4);
  });
});

describe('Crazy 4 Poker', () => {
  it('plays 3× with aces or better, 1× with K-Q-8-4 or better', () => {
    expect(decideC4p(cards('AS AD 4H 7C 2S'))).toEqual({ move: 'play', size: 3 });
    expect(decideC4p(cards('KS QD 8H 4C 2S'))).toEqual({ move: 'play', size: 1 });
    expect(decideC4p(cards('KS QD 8H 3C 2S'))).toEqual({ move: 'fold' });
  });
  it('pays the Super Bonus on a straight or better, four aces most of all', () => {
    expect(superBonusPays(bestFour(cards('AS AD AH AC 2S')).score)).toBe(200);
    expect(superBonusPays(bestFour(cards('5S 5D 5H 5C 2S')).score)).toBe(30);
    expect(superBonusPays(bestFour(cards('5S 6D 7H 8C 2S')).score)).toBe(1);
    expect(superBonusPays(bestFour(cards('AS AD 7H 8C 2S')).score)).toBe(0);
  });
  it('settles Ante, Play and Super Bonus by the published rules', () => {
    for (let round = 0; round < 3000; round++) {
      const r = simulateC4pRound({ seed: { run: 'c4p-test', round }, decide: (d) => decideC4p(d.cards), bonuses: { queensUp: 1 } });
      if (r.folded) {
        expect(r.parts).toMatchObject({ ante: -1, play: 0, superBonus: -1 });
        continue;
      }
      if (!r.opens) expect([r.parts.ante, r.parts.play]).toEqual([0, r.play]);
      const sb = superBonusPays(r.playerScore);
      if (sb > 0) expect(r.parts.superBonus).toBe(sb);
      else if (!r.opens || r.playerScore >= r.dealerScore) expect(r.parts.superBonus).toBe(0);
      else expect(r.parts.superBonus).toBe(-1);
    }
  });
  it('Queens Up reads the best four cards', () => {
    expect(C4P_QUEENS_UP.resolve({ player: cards('QS QD 4H 7C 2S'), dealer: [] })).toBe(6);
    expect(C4P_QUEENS_UP.resolve({ player: cards('JS JD 4H 7C 2S'), dealer: [] })).toBe(-1);
  });
});

describe('Caribbean Stud', () => {
  it('raises pairs, folds under ace-king, and plays ace-king by the up card', () => {
    expect(decideCsp(cards('2S 2D 7H 9C JS'), cards('KH')[0]!)).toBe('raise');
    expect(decideCsp(cards('AS QD 7H 9C JS'), cards('KH')[0]!)).toBe('fold');
    expect(decideCsp(cards('AS KD 7H 9C 3S'), cards('9H')[0]!)).toBe('raise'); // up card matches
    expect(decideCsp(cards('AS KD 7H 9C JS'), cards('AH')[0]!)).toBe('raise'); // ace up, holding a jack
    expect(decideCsp(cards('AS KD 7H 9C 3S'), cards('AH')[0]!)).toBe('fold');
    expect(decideCsp(cards('AS KD QH 9C 3S'), cards('8H')[0]!)).toBe('raise'); // queen, up card under the 9
  });
  it('pays the ante only when the dealer fails to qualify, and the raise by the table when it does', () => {
    for (let round = 0; round < 3000; round++) {
      const r = simulateCspRound({ seed: { run: 'csp-test', round }, decide: (d) => decideCsp(d.cards, d.upcard) });
      if (r.folded) expect(r.parts.ante).toBe(-1);
      else if (!r.qualified) expect(r.parts).toMatchObject({ ante: 1, raise: 0 });
      else expect(Math.abs(r.parts.raise) % 2).toBe(0);
    }
  });
});

describe('Let It Ride', () => {
  it('lets it ride on the published hands', () => {
    expect(decideLir(cards('TS TD 4H'))).toBe('ride');
    expect(decideLir(cards('9S 9D 4H'))).toBe('pull');
    expect(decideLir(cards('5S 6S 7S'))).toBe('ride');
    expect(decideLir(cards('2S 3S 4S'))).toBe('pull');
    expect(decideLir(cards('5S 6S 8S'))).toBe('pull'); // spread four, no high card
    expect(decideLir(cards('8S 9S JS'))).toBe('ride'); // spread four, a jack
    expect(decideLir(cards('2S 7S 9S KS'))).toBe('ride'); // four to a flush
    expect(decideLir(cards('5S 6D 7H 8C'))).toBe('ride'); // open-ended straight
    expect(decideLir(cards('5S 6D 7H 9C'))).toBe('pull'); // inside straight
    expect(decideLir(cards('TS JD QH AC'))).toBe('ride'); // inside, but all high
  });
  it('pays every bet still up, and the third bet always rides', () => {
    for (let round = 0; round < 2000; round++) {
      const r = simulateLirRound({ seed: { run: 'lir-test', round }, decide: (d) => decideLir(d.cards) });
      expect(r.riding[2]).toBe(true);
      expect(r.main).toBe(r.multiplier * r.riding.filter(Boolean).length);
    }
  });
  it('the 5-Card Bonus is paid for one: tens or better is a push', () => {
    const row = LIR_FIVE_CARD.resolve({ hole: cards('TS TD 4H'), community: cards('7C 2S') });
    expect(LIR_FIVE_CARD.rows[row]!.pays).toBe(0);
  });
});

describe('DJ Wild', () => {
  const score = (spec: string) => djScore(cards(spec));
  const name = (spec: string) => DJ_CATEGORY_NAMES[djCategoryOf(score(spec))];
  it('plays deuces and the joker wild', () => {
    expect(name('2S 2D 2H 2C W')).toBe('Five wilds');
    expect(name('KS 2D 2H 2C W')).toBe('Royal flush'); // a lone ten-or-better plus four wilds
    expect(name('9S 2D 2H 2C W')).toBe('Five of a kind');
    expect(name('9S 9D 2H 7C 4S')).toBe('Three of a kind');
    expect(name('9S 8D 2H 6C 5S')).toBe('Straight');
    expect(name('9S 9D 5H 5C 2S')).toBe('Full house');
  });
  it('ranks a royal above five of a kind, and five wilds above both', () => {
    expect(score('AS 2D 2H 2C W')).toBeGreaterThan(score('AS AD 2H 2C W'));
    expect(score('2S 2D 2H 2C W')).toBeGreaterThan(score('AS KS QS JS TS'));
  });
  it('calls a hand natural only when no wild had to stand in', () => {
    expect(djIsNatural(cards('AS 2D 3H 4C 5S'))).toBe(true); // the deuce plays as itself
    expect(djIsNatural(cards('9S 9D 2H 7C 4S'))).toBe(false);
    expect(djIsNatural(cards('3S 4S 5S 6S 2D'))).toBe(false); // the deuce makes it a straight flush
  });
  it('plays a pair of fours or better, but not two fours with a three', () => {
    expect(decideDj(cards('4S 4D 9H 7C 5S'))).toBe('play');
    expect(decideDj(cards('4S 4D 3H 7C 5S'))).toBe('fold');
    expect(decideDj(cards('3S 3D 9H 7C 5S'))).toBe('fold');
    expect(decideDj(cards('KS 2D 9H 7C 5S'))).toBe('play'); // a wild pairs the king
  });
  it('Two-Way Bad Beat pays on the losing hand when both make three of a kind', () => {
    const bb = (player: string, dealer: string, folded = false) => {
      const row = DJ_BAD_BEAT.resolve({ player: cards(player), dealer: cards(dealer), folded });
      return row < 0 ? 'loses' : DJ_BAD_BEAT.rows[row]!.label;
    };
    expect(bb('9S 9D 9H 7C 4S', 'KS KD KH 7D 4D')).toBe('Three of a kind'); // the player's trips lose
    expect(bb('KS QS JS TS 8S', '9S 9D 9H 7C 4S')).toBe('Three of a kind'); // the dealer's trips lose
    expect(bb('KS KD 5H 7C 4S', 'AS AD AH 7D 4D')).toBe('loses'); // a pair does not qualify
    expect(bb('9S 9D 9H 7C 4S', '9C 2D 2H 7D 4D')).toBe('loses'); // trips of nines both ways: a tie loses
    expect(bb('9S 9D 9H 7C 4S', 'KS KD KH 7D 4D', true)).toBe('loses'); // so does a fold
  });
  it('pays the Blind only on a winning straight or better', () => {
    for (let round = 0; round < 3000; round++) {
      const r = simulateDjRound({ seed: { run: 'dj-test', round }, decide: (d) => decideDj(d.cards) });
      if (r.folded) expect(r.parts).toMatchObject({ ante: -1, blind: -1, play: 0 });
      else if (r.playerScore < r.dealerScore) expect(r.parts).toMatchObject({ ante: -1, blind: -1, play: -2 });
      else if (r.playerScore > r.dealerScore) expect(r.parts.blind).toBe(DJ_RULES.blindPays[djCategoryOf(r.playerScore)] ?? 0);
    }
  });
});
