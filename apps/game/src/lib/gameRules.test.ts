import { describe, expect, it } from 'vitest';
import { FREE_BET_RULES, UTH_RULES } from '@idlesuits/sim';
import { ruleKnobs, withOverrides } from './gameRules';

describe('game rules for the admin panel', () => {
  it("lists a game's numbers and on/offs, named, and leaves lists alone", () => {
    const bj = ruleKnobs('blackjack');
    expect(bj.find((k) => k.path === 'decks')).toMatchObject({ value: 6, group: 'Rules' });
    expect(bj.find((k) => k.path === 'push22')).toMatchObject({ value: true });
    expect(bj.some((k) => k.path.startsWith('freeDoubleTotals'))).toBe(false);
    expect(bj.some((k) => k.path === 'penetration')).toBe(true);
    const straight = ruleKnobs('uth').find((k) => k.path === 'blindPays.4');
    expect(straight).toMatchObject({ label: 'Straight', group: 'Blind pays', hint: 'pays :1', value: 1 });
    expect(ruleKnobs('suits').find((k) => k.path === 'raiseCaps.values.5')?.label).toBe('5-card flush');
  });

  it('copies only what it changes, and leaves the rules as designed untouched', () => {
    const tuned = withOverrides(UTH_RULES, { 'blindPays.4': 2, qualifies: 0 });
    expect(tuned.blindPays[4]).toBe(2);
    expect(tuned.qualifies).toBe(0);
    expect(UTH_RULES.blindPays[4]).toBe(1);
    expect(tuned.preflopRaises).toBe(UTH_RULES.preflopRaises);
    expect(withOverrides(FREE_BET_RULES, { decks: 2, push22: false })).toMatchObject({ decks: 2, push22: false });
  });
});
