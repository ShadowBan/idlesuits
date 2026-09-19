import { describe, expect, it } from 'vitest';
import {
  buildShoe,
  DEFAULT_RULES,
  OPTIMAL_BASE_POLICY,
  simulateRound,
  standardDeck,
  type Card,
  type RoundResult,
} from '@idlesuits/sim';
import { beatDelay, direct } from './director';

const shoe = buildShoe(standardDeck('player'));
const play = (round: number): RoundResult =>
  simulateRound({
    shoe,
    seats: [{ raisePolicy: OPTIMAL_BASE_POLICY, sideBets: { flushRush: 1 } }],
    rules: DEFAULT_RULES,
    seed: { run: 'director', dealerId: 'standard', round },
    recordEvents: true,
  });

describe('direct', () => {
  it('emits one beat per event, in order', () => {
    const result = play(1);
    expect(direct(result).map((b) => b.event)).toEqual(result.events);
  });

  it('never looks at the card being revealed', () => {
    // Swap a revealed card for a different one: the drama for that card and
    // every earlier beat must not change, or pacing would leak the outcome.
    for (let round = 0; round < 300; round++) {
      const result = play(round);
      const beats = direct(result);
      const idx = result.events.findIndex((e) => e.type === 'CardRevealed' && e.index === 6);
      const swapped: Card = { uid: 'x', suit: 'S', rank: 2, source: 'table' };
      const altered = {
        ...result,
        events: result.events.map((e, i) => (i === idx && e.type === 'CardRevealed' ? { ...e, card: swapped } : e)),
      };
      expect(direct(altered).slice(0, idx + 1).map((b) => b.drama)).toEqual(beats.slice(0, idx + 1).map((b) => b.drama));
    }
  });

  it('finds tension somewhere across many rounds', () => {
    const dramas = new Set(Array.from({ length: 300 }, (_, r) => direct(play(r)).map((b) => b.drama)).flat());
    expect(dramas).toEqual(new Set(['routine', 'interesting', 'tense']));
  });

  it('smart mode speeds routine beats and slows tense ones', () => {
    const event = play(0).events.find((e) => e.type === 'CardRevealed')!;
    const routine = beatDelay({ event, drama: 'routine' }, 'smart');
    const tense = beatDelay({ event, drama: 'tense' }, 'smart');
    expect(routine).toBeLessThan(beatDelay({ event, drama: 'routine' }, '1x'));
    expect(tense).toBeGreaterThan(beatDelay({ event, drama: 'tense' }, '1x'));
    expect(beatDelay({ event, drama: 'tense' }, '5x')).toBe(beatDelay({ event, drama: 'routine' }, '5x'));
  });
});
