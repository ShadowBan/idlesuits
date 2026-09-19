import { describe, expect, it } from 'vitest';
import { compareFlush, evaluateHand, qualifies, type Face, type Suit } from '../src';

/** hand('AH KH 9H 2C 3D 4S 5S') */
function hand(spec: string): Face[] {
  const ranks: Record<string, number> = { T: 10, J: 11, Q: 12, K: 13, A: 14 };
  return spec.split(' ').map((c) => ({
    rank: ranks[c.slice(0, -1)] ?? Number(c.slice(0, -1)),
    suit: c.slice(-1) as Suit,
  }));
}

describe('evaluateHand', () => {
  it('finds the largest suit and orders its ranks high to low', () => {
    const e = evaluateHand(hand('9H AH 2C KH 3D 4S 5S'));
    expect(e.suit).toBe('H');
    expect(e.size).toBe(3);
    expect(e.ranks).toEqual([14, 13, 9]);
  });

  it('picks the higher flush when two suits tie on size', () => {
    expect(evaluateHand(hand('AH 2H 3H KS QS JS 4D')).ranks).toEqual([14, 3, 2]);
    const e = evaluateHand(hand('QH TH 3H KS 5S 2S 4D'));
    expect(e.suit).toBe('S');
    expect(e.ranks).toEqual([13, 5, 2]);
  });

  it('handles a 7-card flush', () => {
    expect(evaluateHand(hand('2D 4D 6D 8D TD QD AD')).size).toBe(7);
  });

  it('measures straight flushes with ace high or low', () => {
    expect(evaluateHand(hand('AH 2H 3H 9C 9D 9S 5C')).straightFlush).toBe(3);
    expect(evaluateHand(hand('QS KS AS 2C 9D 9S 5C')).straightFlush).toBe(3);
    expect(evaluateHand(hand('KS AS 2S 9C 9D 7H 5C')).straightFlush).toBe(2);
    expect(evaluateHand(hand('4C 5C 6C 7C 8C 2H 3D')).straightFlush).toBe(5);
  });

  it('ignores duplicate ranks when measuring runs', () => {
    expect(evaluateHand(hand('4C 5C 5C 6C 2H 3D 9S')).straightFlush).toBe(3);
  });
});

describe('compareFlush', () => {
  it('ranks flush size above card rank', () => {
    const four = evaluateHand(hand('2C 3C 4C 6C 9H 8D 7S'));
    const three = evaluateHand(hand('AH KH QH 2C 3D 4S 5S'));
    expect(compareFlush(four, three)).toBeGreaterThan(0);
  });

  it('breaks ties card by card', () => {
    const a = evaluateHand(hand('AH KH 5H 2C 3D 4S 7S'));
    const b = evaluateHand(hand('AS KS 4S 2C 3D 5H 7H'));
    expect(compareFlush(a, b)).toBeGreaterThan(0);
  });

  it('returns 0 on an exact tie', () => {
    const a = evaluateHand(hand('AH KH 5H 2C 3D 4S 7S'));
    const b = evaluateHand(hand('AS KS 5S 2C 3D 4H 7H'));
    expect(compareFlush(a, b)).toBe(0);
  });
});

describe('qualifies', () => {
  const rule = { minSize: 3, minHighCard: 9 };
  it('needs a 3-card flush, 9-high', () => {
    expect(qualifies(evaluateHand(hand('9H 3H 2H KC QD JS 4C')), rule)).toBe(true);
    expect(qualifies(evaluateHand(hand('8H 3H 2H KC QD JS 4C')), rule)).toBe(false);
    expect(qualifies(evaluateHand(hand('5H 4H 3H 2H QD JS 4C')), rule)).toBe(true);
    expect(qualifies(evaluateHand(hand('AH KH QC JC TD 9D 8S')), rule)).toBe(false);
  });
});
