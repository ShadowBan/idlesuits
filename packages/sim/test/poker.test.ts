import { describe, expect, it } from 'vitest';
import { Category, comparePoker, evaluatePoker, type Card, type Suit } from '../src';

const RANKS: Record<string, number> = { T: 10, J: 11, Q: 12, K: 13, A: 14 };
/** hand('AS KS QS JS TS') */
const hand = (spec: string): Card[] =>
  spec.split(' ').map((c, i) => ({
    uid: `${c}${i}`,
    rank: RANKS[c.slice(0, -1)] ?? Number(c.slice(0, -1)),
    suit: c.slice(-1) as Suit,
    source: 'player' as const,
  }));

const evaluate = (spec: string) => evaluatePoker(hand(spec));

describe('evaluatePoker', () => {
  it('names every category', () => {
    expect(evaluate('AS KS QS JS TS').category).toBe(Category.RoyalFlush);
    expect(evaluate('9H 8H 7H 6H 5H').category).toBe(Category.StraightFlush);
    expect(evaluate('7C 7D 7H 7S 2C').category).toBe(Category.Quads);
    expect(evaluate('7C 7D 7H 2S 2C').category).toBe(Category.FullHouse);
    expect(evaluate('AD 9D 7D 5D 3D').category).toBe(Category.Flush);
    expect(evaluate('9C 8D 7H 6S 5C').category).toBe(Category.Straight);
    expect(evaluate('7C 7D 7H 9S 2C').category).toBe(Category.Trips);
    expect(evaluate('7C 7D 9H 9S 2C').category).toBe(Category.TwoPair);
    expect(evaluate('7C 7D 9H 4S 2C').category).toBe(Category.Pair);
    expect(evaluate('AC JD 9H 4S 2C').category).toBe(Category.HighCard);
  });

  it('counts the ace-low straight but not a wrap-around', () => {
    expect(evaluate('AC 2D 3H 4S 5C').category).toBe(Category.Straight);
    expect(evaluate('AC 2D 3H 4S 5C').ranks[0]).toBe(5);
    expect(evaluate('QC KD AH 2S 3C').category).toBe(Category.HighCard);
    expect(evaluate('AH 2H 3H 4H 5H').category).toBe(Category.StraightFlush);
  });

  it('picks the best five from seven', () => {
    // Trip sevens plus a pair beats the flush draw that never completes.
    expect(evaluate('7C 7D 7H 2S 2C 9D 4H').category).toBe(Category.FullHouse);
    // Five hearts among seven cards is a flush, not two pair.
    expect(evaluate('AH 9H 7H 5H 3H 9C 7S').category).toBe(Category.Flush);
    // The straight hiding inside seven cards.
    expect(evaluate('9C 8D 7H 6S 5C KD KH').category).toBe(Category.Straight);
  });

  it('breaks ties by kicker', () => {
    expect(comparePoker(evaluate('KC KD AH 4S 2C'), evaluate('KC KD QH 4S 2C'))).toBeGreaterThan(0);
    expect(comparePoker(evaluate('9C 9D 5H 5S KC'), evaluate('9C 9D 5H 5S QC'))).toBeGreaterThan(0);
    expect(comparePoker(evaluate('AC KD 9H 4S 2C'), evaluate('AH KS 9D 4C 2H'))).toBe(0);
    expect(comparePoker(evaluate('AD 9D 7D 5D 3D'), evaluate('AC 9C 7C 5C 2C'))).toBeGreaterThan(0);
  });

  it('reports the rank that made the hand', () => {
    expect(evaluate('7C 7D 9H 4S 2C').madeRank).toBe(7);
    expect(evaluate('7C 7D 9H 9S 2C').madeRank).toBe(9);
    expect(evaluate('JC JD JH 4S 2C').madeRank).toBe(11);
  });
});

describe('pokerScore', () => {
  it('scores exactly like evaluatePoker on random seven-card hands', async () => {
    const { Rng, draw, standardDeck, pokerScore, categoryOfScore } = await import('../src');
    const deck = standardDeck('player');
    const rng = new Rng('score-check');
    for (let i = 0; i < 20000; i++) {
      const cards = draw(rng, deck, 5 + (i % 3));
      const full = evaluatePoker(cards);
      expect(pokerScore(cards)).toBe(full.score);
      expect(categoryOfScore(full.score)).toBe(full.category);
    }
  });
});
