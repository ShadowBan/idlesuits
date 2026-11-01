import { describe, expect, it } from 'vitest';
import {
  BLIND,
  decideTcp,
  houseWay,
  seated,
  simulatePaiGowRound,
  simulateTcpRound,
  simulateUthRound,
  type Card,
} from '../src';

const ids = (cards: readonly Card[]) => cards.map((c) => c.uid);

describe('seated dealing', () => {
  it('passes draws straight through alone at the table', () => {
    let n = 0;
    const draw = seated(() => n++, 3, { index: 0, of: 1 });
    expect([draw(), draw(), draw(), draw()]).toEqual([0, 1, 2, 3]);
  });

  it('gives each seat its own cards, then the shared ones after every seat', () => {
    const deal = (index: number) => {
      let n = 0;
      const draw = seated(() => n++, 3, { index, of: 3 });
      return Array.from({ length: 5 }, draw);
    };
    expect(deal(0)).toEqual([0, 1, 2, 9, 10]);
    expect(deal(1)).toEqual([3, 4, 5, 9, 10]);
    expect(deal(2)).toEqual([6, 7, 8, 9, 10]);
  });
});

describe('hands at one table', () => {
  const seed = { run: 'seats', round: 7 };

  it('Three Card Poker: one dealer, different hands, no card dealt twice', () => {
    const play = (index: number, of: number) =>
      simulateTcpRound({ seed, seat: { index, of }, decide: ({ cards }) => decideTcp(cards) });
    expect(play(0, 1)).toEqual(simulateTcpRound({ seed, decide: ({ cards }) => decideTcp(cards) }));
    const hands = [play(0, 3), play(1, 3), play(2, 3)];
    for (const h of hands) expect(ids(h.dealer)).toEqual(ids(hands[0]!.dealer));
    const all = [...hands.flatMap((h) => ids(h.player)), ...ids(hands[0]!.dealer)];
    expect(new Set(all).size).toBe(all.length);
    // More hands at the table change the cards the last seat gets.
    expect(ids(play(1, 2).player)).not.toEqual(ids(play(0, 1).player));
  });

  it("Ultimate Texas Hold'em: the board and dealer are shared", () => {
    const decide = BLIND.uth;
    const a = simulateUthRound({ seed, seat: { index: 0, of: 2 }, decide });
    const b = simulateUthRound({ seed, seat: { index: 1, of: 2 }, decide });
    expect(ids(a.board)).toEqual(ids(b.board));
    expect(ids(a.dealer)).toEqual(ids(b.dealer));
    expect(ids(a.hole)).not.toEqual(ids(b.hole));
  });

  it('Pai Gow: seven cards a seat from the 53-card deck', () => {
    const decide = BLIND.paigow;
    const hands = [0, 1, 2].map((index) => simulatePaiGowRound({ seed, seat: { index, of: 3 }, decide }));
    const all = [...hands.flatMap((h) => ids(h.player)), ...ids(hands[0]!.dealer)];
    expect(new Set(all).size).toBe(28);
    expect(hands[0]!.playerSet).toEqual(expect.anything());
    expect(houseWay).toBeTypeOf('function');
  });
});

describe('blind hands play all in', () => {
  it('never fold, and always take the biggest raise', () => {
    expect(BLIND.tcp()).toBe('play');
    expect(BLIND.csp()).toBe('raise');
    expect(BLIND.lir()).toBe('ride');
    expect(BLIND.djw()).toBe('play');
    expect(BLIND.uth({ street: 'preflop', hole: [], board: [], raises: [4, 3], canCheck: true, canFold: false })).toEqual({
      move: 'raise',
      raise: 4,
    });
    expect(BLIND.stud({ street: 3, hole: [], shown: [], bets: [], raises: [1, 3] })).toEqual({ move: 'bet', size: 3 });
    expect(BLIND.c4p({ cards: [], discard: 0, sizes: [1] })).toEqual({ move: 'play', size: 1 });
  });
});
