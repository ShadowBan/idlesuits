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
