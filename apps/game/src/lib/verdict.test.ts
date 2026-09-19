import { describe, expect, it } from 'vitest';
import { evaluateHand, type Face, type Suit } from '@idlesuits/sim';
import { explain } from './verdict';

const RANKS: Record<string, number> = { T: 10, J: 11, Q: 12, K: 13, A: 14 };
const hand = (spec: string) =>
  evaluateHand(spec.split(' ').map((c): Face => ({ rank: RANKS[c[0]!] ?? Number(c[0]), suit: c[1] as Suit })));

describe('explain', () => {
  const fourSpades = hand('AS TS 7S 6S 2H 3D 4C');
  const threeDiamonds = hand('TD 8D 5D 2H 3C 4S 6H');
  const threeDiamondsLower = hand('TD 7D 5D 2H 3C 4S 6H');

  it('names both flushes when sizes differ', () => {
    expect(explain('win', fourSpades, threeDiamonds)).toEqual(["Your 4-card ♠ flush beats the dealer's 3-card ♦ flush", null]);
    expect(explain('lose', threeDiamonds, fourSpades)).toEqual(["Dealer's 4-card ♠ flush beats your 3-card ♦ flush", null]);
  });

  it('points at the card that broke a same-size tie', () => {
    expect(explain('win', threeDiamonds, threeDiamondsLower)).toEqual(['Both 3-card flushes: your 8 beats their 7', 1]);
    expect(explain('lose', threeDiamondsLower, threeDiamonds)).toEqual(['Both 3-card flushes: their 8 beats your 7', 1]);
  });

  it('explains folds and non-qualifying dealers', () => {
    expect(explain('fold', threeDiamonds, fourSpades)[0]).toBe('You folded a 3-card ♦ flush');
    expect(explain('dealerNoQualify', fourSpades, threeDiamonds)[0]).toMatch(/qualify/);
  });
});
