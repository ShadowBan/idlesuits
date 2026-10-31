import { describe, expect, it } from 'vitest';
import {
  applyCharms,
  baseTokens,
  CHARM_SETS,
  CHARMS,
  copiesFor,
  describeEffect,
  drawCharm,
  findCharm,
  FRESH_RUN,
  levelOf,
  nextLevel,
  RARITY_WEIGHTS,
  valueAt,
  type RoundReport,
} from '../src';

const report = (over: Partial<RoundReport> = {}): RoundReport => ({
  game: 'test',
  seed: { run: 'r', round: 1 },
  bets: [{ kind: 'main', stake: 1, net: 1 }],
  outcome: 'win',
  ...over,
});

describe('charm catalog', () => {
  it('has unique ids, and every set names three Rare-or-better charms that exist', () => {
    expect(new Set(CHARMS.map((c) => c.id)).size).toBe(CHARMS.length);
    for (const set of CHARM_SETS) {
      for (const id of set.members) {
        const charm = findCharm(id);
        expect(charm, id).toBeDefined();
        expect(['rare', 'epic', 'legendary']).toContain(charm!.rarity);
      }
    }
  });

  it('describes every effect at both ends of its scale', () => {
    for (const charm of CHARMS) {
      for (const effect of charm.effects) {
        expect(describeEffect(effect, 1)).toMatch(/\S/);
        expect(describeEffect(effect, 10)).not.toBe(describeEffect(effect, 1));
      }
    }
  });
});

describe('levels', () => {
  it('doubles the copies needed for each level, to 512 at level 10', () => {
    expect([1, 2, 3, 4, 7, 8, 511, 512, 5000].map(levelOf)).toEqual([1, 2, 2, 3, 3, 4, 9, 10, 10]);
    expect(copiesFor(10)).toBe(512);
    expect(nextLevel(5)).toEqual({ need: 4, have: 1 });
    expect(nextLevel(512)).toBeNull();
  });

  it('scales an effect from its minimum at level 1 to its maximum at level 10', () => {
    expect(valueAt({ min: 1, max: 10 }, 1)).toBe(1);
    expect(valueAt({ min: 1, max: 10 }, 10)).toBe(10);
    expect(valueAt({ min: 1, max: 10 }, 5.5)).toBeCloseTo(5.5);
  });
});

describe('the machine', () => {
  it('is reproducible and draws rarities at their weights', () => {
    expect(drawCharm('s', 7)).toBe(drawCharm('s', 7));
    const counts: Record<string, number> = {};
    const n = 40_000;
    for (let i = 0; i < n; i++) {
      const rarity = findCharm(drawCharm('weights', i))!.rarity;
      counts[rarity] = (counts[rarity] ?? 0) + 1;
    }
    for (const [rarity, weight] of Object.entries(RARITY_WEIGHTS)) {
      const seen = (counts[rarity] ?? 0) / n;
      expect(Math.abs(seen - weight), rarity).toBeLessThan(4 * Math.sqrt((weight * (1 - weight)) / n) + 1e-4);
    }
  });
});

describe('tokens', () => {
  it('pays each winning bet its odds, whatever the stake', () => {
    const r = report({
      bets: [
        { kind: 'main', stake: 1, net: 1 },
        { kind: 'main', stake: 4, net: 4 },
        { kind: 'side', stake: 0.5, net: 20 },
        { kind: 'side', stake: 1, net: -1 },
      ],
    });
    expect(baseTokens(r)).toBe(1 + 1 + 40);
    expect(applyCharms(r, [], FRESH_RUN).tokens).toBe(42);
  });

  it('earns nothing on a loss without a charm', () => {
    const r = report({ bets: [{ kind: 'main', stake: 1, net: -1 }], outcome: 'lose' });
    const out = applyCharms(r, [], FRESH_RUN);
    expect(out.tokens).toBe(0);
    expect(out.cash).toBe(0);
  });
});

describe('effects', () => {
  it('multiplies tokens and credits the charm that did it', () => {
    const out = applyCharms(report(), [{ id: 'fuzzy-dice', level: 10 }], FRESH_RUN);
    expect(out.tokens).toBeCloseTo(1.3);
    expect(out.triggers).toEqual([{ source: 'fuzzy-dice', name: 'Fuzzy Dice', cash: 0, tokens: expect.closeTo(0.3) }]);
  });

  it('refunds missed side bets and pays pushes', () => {
    const r = report({
      bets: [
        { kind: 'main', stake: 2, net: 0 },
        { kind: 'side', stake: 1, net: -1 },
      ],
      outcome: 'push',
    });
    const out = applyCharms(
      r,
      [
        { id: 'lucky-penny', level: 10 },
        { id: 'lucky-socks', level: 10 },
      ],
      FRESH_RUN,
    );
    expect(out.cash).toBeCloseTo(0.05 + 2 * 0.12);
  });

  it('pays a hand bonus only from its category up, and never after a fold', () => {
    const horseshoe = [{ id: 'horseshoe', level: 1 }];
    expect(applyCharms(report({ tier: 3 }), horseshoe, FRESH_RUN).cash).toBeCloseTo(0.006);
    expect(applyCharms(report({ tier: 2 }), horseshoe, FRESH_RUN).cash).toBe(0);
    expect(applyCharms(report({ tier: 6, outcome: 'fold' }), horseshoe, FRESH_RUN).cash).toBe(0);
  });

  it('carries streaks between hands', () => {
    const cat = [{ id: 'maneki-neko', level: 10 }];
    let run = FRESH_RUN;
    const cash: number[] = [];
    for (let i = 0; i < 7; i++) {
      const out = applyCharms(report({ seed: { run: 'r', round: i } }), cat, run);
      cash.push(out.cash);
      run = out.state;
    }
    expect(cash.map((c) => +(c / 0.03).toFixed(6))).toEqual([0, 1, 2, 3, 4, 5, 5]);
    const loss = applyCharms(report({ bets: [{ kind: 'main', stake: 1, net: -1 }], outcome: 'lose' }), cat, run);
    expect(loss.state.winStreak).toBe(0);
  });

  it('shields the fourth loss in a row with the Evil Eye, then builds again', () => {
    const eye = [{ id: 'evil-eye', level: 10 }];
    const lose = (round: number) =>
      report({ seed: { run: 'r', round }, bets: [{ kind: 'main', stake: 2, net: -2 }], outcome: 'lose' });
    let run = FRESH_RUN;
    const cash: number[] = [];
    for (let i = 0; i < 8; i++) {
      const out = applyCharms(lose(i), eye, run);
      cash.push(out.cash);
      run = out.state;
    }
    expect(cash).toEqual([0, 0, 0, 2, 0, 0, 0, 2]);
  });

  it('is seeded: the same hand rolls its chances the same way every time', () => {
    const toad = [{ id: 'hamsa', level: 10 }];
    const results = Array.from({ length: 2000 }, (_, round) =>
      applyCharms(report({ seed: { run: 'x', round }, bets: [{ kind: 'main', stake: 1, net: -1 }], outcome: 'lose' }), toad, FRESH_RUN)
        .cash,
    );
    const again = Array.from({ length: 2000 }, (_, round) =>
      applyCharms(report({ seed: { run: 'x', round }, bets: [{ kind: 'main', stake: 1, net: -1 }], outcome: 'lose' }), toad, FRESH_RUN)
        .cash,
    );
    expect(results).toEqual(again);
    const rate = results.filter((c) => c > 0).length / results.length;
    expect(rate).toBeGreaterThan(0.04);
    expect(rate).toBeLessThan(0.08);
  });

  it('adds a set bonus only with all three members equipped, at the lowest level', () => {
    const two = [
      { id: 'maneki-neko', level: 10 },
      { id: 'golden-toad', level: 10 },
    ];
    const three = [...two, { id: 'jade-dragon', level: 1 }];
    expect(applyCharms(report(), two, FRESH_RUN).triggers.some((t) => t.source === 'set:eastern')).toBe(false);
    const set = applyCharms(report(), three, FRESH_RUN).triggers.find((t) => t.source === 'set:eastern');
    expect(set?.tokens).toBeCloseTo(0.5);
  });
});
