import { describe, expect, it } from 'vitest';
import {
  buildShoe,
  DEFAULT_RULES,
  draw,
  lookupScale,
  maxRaise,
  OPTIMAL_BASE_POLICY,
  Rng,
  simulateRound,
  standardDeck,
  FLUSH_RUSH,
  DEFAULT_RAISE_CAPS,
  decideRaise,
  type RoundInput,
} from '../src';

const shoe = buildShoe(standardDeck('player'));
const input = (round: number, overrides: Partial<RoundInput> = {}): RoundInput => ({
  shoe,
  seats: [{ raisePolicy: OPTIMAL_BASE_POLICY, sideBets: { flushRush: 1 } }],
  rules: DEFAULT_RULES,
  seed: { run: 'test', dealerId: 'standard', round },
  ...overrides,
});

describe('rng', () => {
  it('is deterministic per seed', () => {
    expect(draw(new Rng('a', 1), shoe, 14)).toEqual(draw(new Rng('a', 1), shoe, 14));
    expect(draw(new Rng('a', 1), shoe, 14)).not.toEqual(draw(new Rng('a', 2), shoe, 14));
  });

  it('draws without replacement', () => {
    const cards = draw(new Rng('x'), shoe, 52);
    expect(new Set(cards.map((c) => c.uid)).size).toBe(52);
  });
});

describe('simulateRound', () => {
  it('replays identically from the same seed', () => {
    const a = simulateRound(input(42, { recordEvents: true }));
    const b = simulateRound(input(42, { recordEvents: true }));
    expect(a).toEqual(b);
  });

  it('deals 7 distinct cards to each side', () => {
    const r = simulateRound(input(1, { seats: [input(1).seats[0]!, input(1).seats[0]!] }));
    const uids = [...r.seats.flatMap((s) => s.cards), ...r.dealerCards].map((c) => c.uid);
    expect(uids).toHaveLength(21);
    expect(new Set(uids).size).toBe(21);
  });

  it('emits events in presentation order', () => {
    const types = simulateRound(input(3, { recordEvents: true })).events.map((e) => e.type);
    const firstDealer = types.indexOf('DealerQualified');
    expect(types.indexOf('RaiseDecided')).toBeLessThan(firstDealer);
    expect(types.filter((t) => t === 'CardRevealed')).toHaveLength(14);
    expect(types.at(-1)).toBe('RoundSettled');
  });

  it('records no events unless asked', () => {
    expect(simulateRound(input(3)).events).toEqual([]);
  });

  it('makes unclaimed bets cost the player only when the dealer owns them', () => {
    const rules = { ...DEFAULT_RULES, unclaimedOwner: 'dealer' as const };
    for (let round = 0; round < 500; round++) {
      const r = simulateRound(input(round, { rules, seats: [{ raisePolicy: OPTIMAL_BASE_POLICY, sideBets: {} }] }));
      const bet = r.seats[0]!.sideBets.flushRush!;
      expect(bet.owner).toBe('dealer');
      expect(bet.net).toBe(-lookupScale(FLUSH_RUSH.pays, r.dealerHand.size));
    }
  });
});

describe('scale tables', () => {
  it('extrapolates pay tables and raise caps past 7 cards', () => {
    expect(lookupScale(FLUSH_RUSH.pays, 3)).toBe(0);
    expect(lookupScale(FLUSH_RUSH.pays, 7)).toBe(300);
    expect(lookupScale(FLUSH_RUSH.pays, 9)).toBe(30000);
    expect(maxRaise(DEFAULT_RAISE_CAPS, 5)).toBe(2);
    expect(maxRaise(DEFAULT_RAISE_CAPS, 9)).toBe(5);
  });
});

describe('raise policies', () => {
  const plan = { kind: 'bySize' as const, raises: { 2: 0, 3: 1, 4: 1, 5: 2, 6: 3 }, minRanks: [10, 8, 6] };

  it('the default bySize plan makes the same decisions as the optimal policy', () => {
    for (let round = 0; round < 3000; round++) {
      const a = simulateRound(input(round, { seats: [{ raisePolicy: plan, sideBets: {} }] }));
      const b = simulateRound(input(round, { seats: [{ raisePolicy: OPTIMAL_BASE_POLICY, sideBets: {} }] }));
      expect(a.seats[0]!.raise).toBe(b.seats[0]!.raise);
    }
  });

  it('uses the largest listed size for bigger flushes and clamps to the cap', () => {
    const hand = (size: number) => ({ suit: 'H' as const, size, ranks: Array(size).fill(14), suitCounts: { S: 0, H: size, D: 0, C: 0 }, straightFlush: 1 });
    expect(decideRaise(plan, hand(7), 3)).toBe(3);
    expect(decideRaise({ kind: 'bySize', raises: { 4: 3 } }, hand(4), 1)).toBe(1);
    expect(decideRaise({ kind: 'bySize', raises: { 4: 1 } }, hand(3), 1)).toBe(0);
  });

  it('a fixed decision replays the same cards with a different bet', () => {
    const folded = simulateRound(input(9, { seats: [{ raisePolicy: { kind: 'fixed', raise: 0 }, sideBets: {} }] }));
    const raised = simulateRound(input(9, { seats: [{ raisePolicy: { kind: 'fixed', raise: 1 }, sideBets: {} }] }));
    expect(raised.seats[0]!.cards).toEqual(folded.seats[0]!.cards);
    expect(raised.dealerCards).toEqual(folded.dealerCards);
    expect(folded.seats[0]!.outcome).toBe('fold');
    expect(raised.seats[0]!.raise).toBe(1);
  });
});
