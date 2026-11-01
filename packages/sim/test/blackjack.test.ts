import { describe, expect, it } from 'vitest';
import {
  FREE_BET_RULES,
  handTotal,
  isBlackjack,
  isPair,
  simulateBjRound,
  solveStrategy,
  shuffleShoe,
  cutCardOut,
  stepRound,
  totalOf,
  type BjChoice,
  type BjRoundResult,
  type Card,
} from '../src';

const tables = solveStrategy(FREE_BET_RULES);
const play = (round: number, over: Partial<Parameters<typeof simulateBjRound>[0]> = {}): BjRoundResult =>
  simulateBjRound({ tables, seed: { run: 'test', round }, ...over });

const card = (rank: number): Card => ({ uid: `x${rank}${Math.random()}`, suit: 'S', rank, source: 'player' });

describe('hand totals', () => {
  it('counts an ace as eleven until it would bust', () => {
    expect(totalOf([14, 7])).toEqual({ total: 18, soft: true, bust: false });
    expect(totalOf([14, 7, 5])).toEqual({ total: 13, soft: false, bust: false });
    expect(totalOf([14, 14])).toEqual({ total: 12, soft: true, bust: false });
    expect(totalOf([14, 14, 14, 9])).toEqual({ total: 12, soft: false, bust: false });
  });

  it('values every ten-card as ten and reports busts', () => {
    expect(totalOf([13, 12]).total).toBe(20);
    expect(totalOf([10, 11, 5])).toEqual({ total: 25, soft: false, bust: true });
  });

  it('knows a blackjack from a two-card 21', () => {
    expect(isBlackjack([card(14), card(13)])).toBe(true);
    expect(isBlackjack([card(7), card(7), card(7)])).toBe(false);
    expect(isPair([card(12), card(13)])).toBe(true); // both ten-value
  });
});

describe('solved strategy', () => {
  it('always takes the free double on a hard 9, 10 or 11', () => {
    for (const regime of ['real', 'free'] as const) {
      for (const total of [9, 10, 11]) {
        for (let up = 2; up <= 11; up++) {
          expect(tables[regime].hard[total]![up]).toMatch(/^Ds?$/);
        }
      }
    }
  });

  it('splits every pair the house covers, but never tens, and never splits fives', () => {
    for (let up = 2; up <= 11; up++) {
      expect(tables.real.pairs[10]![up]).toBe('S');
      expect(tables.real.pairs[11]![up]).toBe('P');
      expect(tables.real.pairs[8]![up]).toBe('P');
      expect(tables.real.pairs[5]![up]).not.toBe('P');
    }
  });

  it('plays a free-bet hand differently, because it cannot lose', () => {
    const differences = [14, 15, 16].filter((total) => tables.real.hard[total]![2] !== tables.free.hard[total]![2]);
    expect(differences.length).toBeGreaterThan(0);
  });
});

describe('simulateBjRound', () => {
  it('replays identically from the same seed', () => {
    expect(play(7, { recordEvents: true })).toEqual(play(7, { recordEvents: true }));
  });

  it('never risks the player on a hand the house staked', () => {
    for (let round = 0; round < 4000; round++) {
      for (const hand of play(round).hands) {
        if (hand.bet === 0) expect(hand.net).toBeGreaterThanOrEqual(0);
        if (hand.outcome === 'bust') expect(hand.net).toBe(-hand.bet);
      }
    }
  });

  it('pushes every standing hand when the dealer makes 22', () => {
    let seen = 0;
    for (let round = 0; round < 4000; round++) {
      const result = play(round);
      if (result.dealerTotal.total !== 22) continue;
      seen++;
      for (const hand of result.hands) {
        if (handTotal(hand.cards).bust) continue;
        expect(hand.outcome).toBe('push22');
        expect(hand.net).toBe(0);
      }
    }
    expect(seen).toBeGreaterThan(100);
  });

  it('pays blackjack 3:2 and respects the hand limit', () => {
    let blackjacks = 0;
    for (let round = 0; round < 4000; round++) {
      const result = play(round);
      expect(result.hands.length).toBeLessThanOrEqual(FREE_BET_RULES.maxHands);
      // Only the first hand holds the player's own money.
      expect(result.hands.filter((h) => h.bet > 0).length).toBeLessThanOrEqual(1);
      const first = result.hands[0]!;
      if (first.outcome === 'blackjack') {
        blackjacks++;
        expect(first.net).toBe(1.5);
      }
    }
    expect(blackjacks).toBeGreaterThan(100);
  });

  it('makes the dealer draw to soft 17', () => {
    for (let round = 0; round < 3000; round++) {
      const { dealerTotal, hands, dealerBlackjack } = play(round);
      // The dealer only draws when a hand is still live and nobody had a blackjack.
      if (dealerBlackjack || hands[0]!.outcome === 'blackjack') continue;
      if (hands.every((h) => handTotal(h.cards).bust)) continue;
      expect(dealerTotal.total === 17 && dealerTotal.soft).toBe(false);
    }
  });
});

describe('stepRound', () => {
  const step = (round: number, moves: BjChoice[]) => stepRound({ tables, seed: { run: 'test', round } }, moves);

  it('replaying the suggested moves deals exactly the same round', () => {
    let stepped = 0;
    for (let round = 0; round < 2000; round++) {
      const moves: BjChoice[] = [];
      let guard = 0;
      for (;;) {
        const next = step(round, moves);
        if (next.kind === 'done') {
          expect(next.result).toEqual(play(round));
          break;
        }
        stepped++;
        moves.push(next.decision.suggestion);
        expect(guard++).toBeLessThan(25);
      }
    }
    expect(stepped).toBeGreaterThan(500);
  });
});

describe('a dealt shoe', () => {
  it('holds every card of every deck once, burns one and cuts 70-80% in', () => {
    const shoe = shuffleShoe(6, 'test', 0);
    expect(shoe.cards).toHaveLength(312);
    expect(new Set(shoe.cards.map((c) => c.uid)).size).toBe(312);
    expect(shoe.next).toBe(1);
    expect(shoe.cut).toBeGreaterThanOrEqual(218);
    expect(shoe.cut).toBeLessThanOrEqual(250);
    expect(shuffleShoe(6, 'test', 0)).toEqual(shoe);
    expect(shuffleShoe(6, 'test', 1).cards).not.toEqual(shoe.cards);
  });

  it('deals rounds in order from the shoe until the cut card comes out', () => {
    const shoe = shuffleShoe(6, 'test', 0);
    let rounds = 0;
    while (!cutCardOut(shoe)) {
      const result = play(rounds, { shoe });
      const dealt = [...result.hands.flatMap((h) => h.cards), ...result.dealer];
      expect(dealt.map((c) => c.uid).sort()).toEqual(
        shoe.cards.slice(shoe.next, shoe.next + result.cardsUsed).map((c) => c.uid).sort(),
      );
      shoe.next += result.cardsUsed;
      rounds++;
    }
    // About 5.4 cards a round over three quarters of six decks.
    expect(rounds).toBeGreaterThan(30);
    expect(rounds).toBeLessThan(60);
  });
});

describe('insurance', () => {
  const ace = (rank: number, i: number): Card => ({ uid: `i${i}`, suit: 'H', rank, source: 'player' });
  // Player, dealer up, player, dealer hole, then the rest.
  const stacked = (ranks: number[]) => ({ cards: ranks.map(ace), next: 0 });

  it('is offered only against an ace, and basic strategy declines it', () => {
    const offered = play(0, { shoe: stacked([10, 14, 7, 13]), recordEvents: true });
    expect(offered.events.find((e) => e.type === 'InsuranceDecided')).toEqual({ type: 'InsuranceDecided', taken: false });
    expect(offered.insurance).toBeNull();
    const notOffered = play(0, { shoe: stacked([10, 13, 7, 9, 5, 5, 5]), recordEvents: true });
    expect(notOffered.events.some((e) => e.type === 'InsuranceDecided')).toBe(false);
  });

  it('pays 2:1 on half a bet against a dealer blackjack, and loses the half otherwise', () => {
    const blackjack = play(0, { shoe: stacked([10, 14, 7, 13]), insure: () => true });
    expect(blackjack.insurance).toBe(1);
    expect(blackjack.net).toBe(0); // the main bet loses one, insurance wins one
    const noBlackjack = play(0, { shoe: stacked([10, 14, 10, 7, 5, 5, 5]), insure: () => true });
    expect(noBlackjack.insurance).toBe(-0.5);
    expect(noBlackjack.net).toBe(0.5); // 20 beats a soft 18, less the insurance
  });
});
