import { describe, expect, it } from 'vitest';
import {
  layoutNumber,
  pocketColor,
  RED_NUMBERS,
  ROULETTE_BETS,
  ROULETTE_EDGE,
  ROULETTE_POCKETS,
  ROULETTE_WHEEL,
  rouletteBet,
  rouletteSettle,
  rouletteSpin,
} from '../src';

describe('the wheel and the layout', () => {
  it('has every pocket once, 18 red and 18 black, and zero green', () => {
    expect([...ROULETTE_WHEEL].sort((a, b) => a - b)).toEqual(Array.from({ length: 37 }, (_, i) => i));
    expect(RED_NUMBERS.size).toBe(18);
    expect(pocketColor(0)).toBe('green');
    // Round the wheel the colours alternate, red and black, after zero.
    ROULETTE_WHEEL.slice(1).forEach((n, i) => expect(pocketColor(n)).toBe(i % 2 === 0 ? 'red' : 'black'));
  });

  it('lays 3, 6 … 36 along the top row and 1, 4 … 34 along the bottom', () => {
    expect(layoutNumber(0, 0)).toBe(3);
    expect(layoutNumber(0, 2)).toBe(1);
    expect(layoutNumber(11, 0)).toBe(36);
    expect(layoutNumber(11, 2)).toBe(34);
  });

  it('takes every bet the table does, each once, paying the published odds', () => {
    const ids = ROULETTE_BETS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    const count = (kind: string) => ROULETTE_BETS.filter((b) => b.kind === kind).length;
    // 37 straights; 57 splits on the numbers and 3 with zero; 12 streets; 22 corners; 11 six lines.
    expect(count('straight')).toBe(37);
    expect(count('split')).toBe(60);
    expect(count('street')).toBe(12);
    expect(count('corner')).toBe(22);
    expect(count('line')).toBe(11);
    const pays: Record<string, number> = { straight: 35, split: 17, street: 11, trio: 11, corner: 8, firstFour: 8, line: 5, dozen: 2, column: 2, red: 1, black: 1, odd: 1, even: 1, low: 1, high: 1 };
    for (const b of ROULETTE_BETS) expect(b.pays, b.id).toBe(pays[b.kind]);
    // Zero loses every outside bet.
    for (const id of ['red', 'black', 'odd', 'even', 'low', 'high', 'dozen1', 'column1']) expect(rouletteBet(id)!.numbers).not.toContain(0);
  });

  it('gives every bet the same house edge, 1 in 37', () => {
    for (const b of ROULETTE_BETS) {
      let ev = 0;
      for (let pocket = 0; pocket < ROULETTE_POCKETS; pocket++) ev += rouletteSettle({ [b.id]: 1 }, pocket).net / ROULETTE_POCKETS;
      expect(ev, b.id).toBeCloseTo(-ROULETTE_EDGE, 12);
    }
  });
});

describe('a spin', () => {
  it('lands in every pocket alike, and replays from its seed', () => {
    const n = 370_000;
    const counts = Array<number>(ROULETTE_POCKETS).fill(0);
    for (let round = 0; round < n; round++) counts[rouletteSpin({ run: 'r', round })]!++;
    const p = 1 / ROULETTE_POCKETS;
    counts.forEach((c, k) => expect(Math.abs(c / n - p), `pocket ${k}`).toBeLessThan(4.5 * Math.sqrt((p * (1 - p)) / n)));
    expect(rouletteSpin({ run: 'r', round: 9 })).toBe(rouletteSpin({ run: 'r', round: 9 }));
  });

  it('settles a whole layout: each bet won or lost, and the net across them', () => {
    const r = rouletteSettle({ '17': 2, '14-17': 1, red: 5, dozen2: 3, nonsense: 9, '20': 0 }, 17);
    // 17 is black, in the second dozen.
    expect(r.bets).toEqual([
      { id: '17', stake: 2, net: 70 },
      { id: '14-17', stake: 1, net: 17 },
      { id: 'red', stake: 5, net: -5 },
      { id: 'dozen2', stake: 3, net: 6 },
    ]);
    expect(r.staked).toBe(11);
    expect(r.net).toBe(88);
    expect(rouletteSettle({ red: 5, black: 5, '0': 1 }, 0).net).toBe(25);
  });
});
