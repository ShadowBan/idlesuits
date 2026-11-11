import { findCharm } from '@idlesuits/sim';
import { describe, expect, it } from 'vitest';
import {
  act,
  claimable,
  CONSTELLATIONS,
  ENGINE_TUNING,
  freshPlayer,
  offerFor,
  passClock,
  playKeno,
  readPlayer,
  rollPass,
  seasonBack,
  seasonCharm,
  STARBOUND,
  TRACK,
  trackPass,
  weekIndex,
  weekStart,
  type EngineContext,
  type PlayerState,
} from '../src';

/** A Wednesday in week 45 since the epoch (Monday 5 Jan 2026). */
const NOW = Date.UTC(2026, 10, 11, 12);
const ctx = (now = NOW): EngineContext => ({ now, tuning: ENGINE_TUNING, seed: (game, round) => `stars:${game}:${round}` });

function run(state: PlayerState, action: unknown, c = ctx(), admin = false): PlayerState {
  const out = act(state, action, c, { admin });
  if (!out.ok) throw new Error(out.error);
  return out.state;
}

const report = (game: string, extra: Record<string, unknown> = {}) => ({ game, seed: { run: 'r', round: 0 }, bets: [], outcome: 'win' as const, ...extra });

describe('the calendar', () => {
  it('weeks start on Monday, UTC, and seasons are four of them', () => {
    const w = weekIndex(NOW);
    expect(new Date(weekStart(w)).getUTCDay()).toBe(1);
    expect(weekStart(w)).toBeLessThanOrEqual(NOW);
    expect(weekStart(w + 1)).toBeGreaterThan(NOW);
    const clock = passClock(NOW);
    expect(clock.weekOfSeason).toBeGreaterThanOrEqual(1);
    expect(clock.weekOfSeason).toBeLessThanOrEqual(4);
    expect(clock.seasonEnds).toBeGreaterThanOrEqual(clock.weekEnds);
  });

  it('offers three different constellations a week, and all nine every three weeks', () => {
    for (let cycle = 0; cycle < 5; cycle++) {
      const seen = [0, 1, 2].flatMap((i) => offerFor(cycle * 3 + i));
      expect(seen).toHaveLength(9);
      expect(new Set(seen).size).toBe(9);
    }
    expect(offerFor(7)).toEqual(offerFor(7));
  });

  it('gives every constellation six stars, six missions and lines between its stars', () => {
    for (const c of CONSTELLATIONS) {
      expect(c.stars).toHaveLength(6);
      expect(c.missions).toHaveLength(6);
      for (const [a, b] of c.lines) expect(c.stars[a] && c.stars[b]).toBeTruthy();
    }
  });

  it('names real charms for every season, all Starbound and none in the machine', () => {
    for (const id of STARBOUND) expect(findCharm(id)?.rarity).toBe('starbound');
    expect(seasonCharm(0, 0)).not.toBe(seasonCharm(0, 1));
    expect(seasonBack(1, 0)).not.toBe(seasonBack(1, 1));
  });
});

describe('lucky stars', () => {
  it('counts rounds toward all three offered constellations until one is chosen', () => {
    const offer = offerFor(weekIndex(NOW));
    let s = freshPlayer('p');
    s = trackPass(s, report('blackjack', { blackjack: true }), 1.5, 2, NOW);
    expect(s.pass.week).toBe(weekIndex(NOW));
    expect(Object.keys(s.pass.progress).sort()).toEqual([...offer].sort());
    expect(s.pass.played).toEqual(['blackjack']);
  });

  it('lights stars when their missions are done, paying Tokens and stardust, once', () => {
    const id = offerFor(weekIndex(NOW))[0]!;
    let s = run(freshPlayer('p'), { type: 'pass.choose', id });
    expect(s.pass.chosen).toBe(id);
    const tokens = s.meta.tokens;
    s = run(s, { type: 'admin.pass', finish: 2 }, ctx(), true);
    expect(s.pass.lit).toEqual([0, 1]);
    expect(s.pass.dust).toBe(2);
    expect(s.meta.tokens).toBe(tokens + 100);
    // Lighting again pays nothing more.
    s = run(s, { type: 'admin.pass', finish: 2 }, ctx(), true);
    expect(s.pass.dust).toBe(2);
    // All six: the full constellation's bonus too.
    s = run(s, { type: 'admin.pass', finish: 6 }, ctx(), true);
    expect(s.pass.lit).toHaveLength(6);
    expect(s.pass.dust).toBe(12 + 2);
    expect(s.pass.freePulls).toBe(1);
  });

  it('chooses once a week, and only from the offer', () => {
    const week = weekIndex(NOW);
    const offered = offerFor(week);
    const other = CONSTELLATIONS.find((c) => !offered.includes(c.id))!.id;
    const s = freshPlayer('p');
    expect(act(s, { type: 'pass.choose', id: other }, ctx()).ok).toBe(false);
    const chose = run(s, { type: 'pass.choose', id: offered[1] });
    expect(act(chose, { type: 'pass.choose', id: offered[2] }, ctx()).ok).toBe(false);
    // Next week, a new choice.
    const next = run(chose, { type: 'pass.choose', id: offerFor(week + 1)[0] }, ctx(NOW + 7 * 86_400_000));
    expect(next.pass.chosen).toBe(offerFor(week + 1)[0]);
  });

  it('lights stars already done when a constellation is chosen late', () => {
    const id = offerFor(weekIndex(NOW))[0]!;
    let s = run(freshPlayer('p'), { type: 'admin.pass', finish: 3 }, ctx(), true);
    expect(s.pass.lit).toEqual([]);
    s = run(s, { type: 'pass.choose', id });
    expect(s.pass.lit).toEqual([0, 1, 2]);
  });

  it('counts real rounds: Keno draws toward the Seven', () => {
    // Find a week offering the Lucky Seven.
    let week = weekIndex(NOW);
    while (!offerFor(week).includes('seven')) week++;
    const at = weekStart(week) + 1000;
    let s = run(freshPlayer('p'), { type: 'pass.choose', id: 'seven' }, ctx(at));
    const out = playKeno(s, { ticket: [1, 2, 3, 4, 5], step: 0, room: 0, rounds: 10 }, ctx(at));
    if (!out.ok) throw new Error(out.error);
    s = out.state;
    expect(s.pass.progress.seven![0]).toBe(10);
    expect(s.pass.progress.seven![1]).toBe(1);
  });

  it('starts the week over, keeping the season’s stardust', () => {
    let s = run(freshPlayer('p'), { type: 'pass.choose', id: offerFor(weekIndex(NOW))[0] });
    s = run(s, { type: 'admin.pass', finish: 6 }, ctx(), true);
    const { weekEnds, seasonEnds } = passClock(NOW);
    if (weekEnds === seasonEnds) return;
    const later = rollPass(s, weekEnds + 1);
    expect(later.pass.chosen).toBeNull();
    expect(later.pass.lit).toEqual([]);
    expect(later.pass.dust).toBe(14);
  });
});

describe('the season track', () => {
  it('claims tiers reached, paying each reward once', () => {
    let s = run(freshPlayer('p'), { type: 'admin.pass', dust: 22 }, ctx(), true);
    expect(claimable(s.pass)).toEqual([0, 1, 2, 3, 4, 5]);
    const tokens = s.meta.tokens;
    s = run(s, { type: 'pass.claim' });
    expect(s.pass.claimed).toEqual([0, 1, 2, 3, 4, 5]);
    expect(s.meta.tokens).toBe(tokens + 700);
    expect(s.pass.freePulls).toBe(2);
    expect(s.pass.boostUntil).toBe(NOW + 60 * 60_000);
    const season = s.pass.season;
    expect(s.pass.backs).toEqual([seasonBack(season, 0)]);
    expect(s.meta.collection[seasonCharm(season, 0)]).toBe(1);
    expect(act(s, { type: 'pass.claim' }, ctx()).ok).toBe(false);
  });

  it('doubles Tokens while a boost runs', () => {
    let s = run(freshPlayer('p'), { type: 'admin.pass', dust: 10 }, ctx(), true);
    s = run(s, { type: 'pass.claim', tiers: [2] });
    const play = (state: PlayerState, now: number) => {
      let tokens = 0;
      for (let i = 0; i < 6; i++) {
        const out = playKeno(state, { ticket: [7], step: 0, room: 0, rounds: 10 }, ctx(now));
        if (!out.ok) throw new Error(out.error);
        state = out.state;
        tokens += out.rounds.reduce((sum, r) => sum + r.tokens, 0);
      }
      return tokens;
    };
    const boosted = play(s, NOW + 1000);
    const plain = play(s, NOW + 2 * 60 * 60_000);
    expect(plain).toBeGreaterThan(0);
    expect(boosted).toBeCloseTo(plain * 2);
  });

  it('spends free pulls at the Charm Machine', () => {
    let s = run(freshPlayer('p'), { type: 'admin.pass', dust: 6 }, ctx(), true);
    s = run(s, { type: 'pass.claim' });
    const tokens = s.meta.tokens;
    s = run(s, { type: 'charms.pull', count: 1, free: true });
    expect(s.pass.freePulls).toBe(1);
    expect(s.meta.tokens).toBe(tokens - 0);
    expect(s.meta.pulls).toBe(1);
    expect(act(s, { type: 'charms.pull', count: 10, free: true }, ctx()).ok).toBe(false);
  });

  it('claims what a season reached when the next begins, and starts the track over', () => {
    let s = run(freshPlayer('p'), { type: 'admin.pass', dust: TRACK[0]!.dust }, ctx(), true);
    const tokens = s.meta.tokens;
    const { seasonEnds } = passClock(NOW);
    s = rollPass(s, seasonEnds + 1);
    expect(s.meta.tokens).toBe(tokens + 200);
    expect(s.pass.dust).toBe(0);
    expect(s.pass.claimed).toEqual([]);
  });

  it('survives a save and a reload', () => {
    let s = run(freshPlayer('p'), { type: 'pass.choose', id: offerFor(weekIndex(NOW))[2] });
    s = run(s, { type: 'admin.pass', finish: 4, dust: 20 }, ctx(), true);
    s = run(s, { type: 'pass.claim' });
    const back = readPlayer(JSON.parse(JSON.stringify(s)), 'p');
    expect(back.pass).toEqual(s.pass);
  });
});
