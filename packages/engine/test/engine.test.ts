import { crashLineRtp, crashPoint, dropBall, kenoDraw, KENO_BUFFS, minesBoard, plinkoPays, rouletteSpin, STARTER_TOKENS } from '@idlesuits/sim';
import { describe, expect, it } from 'vitest';
import {
  act,
  bankOf,
  Decimal,
  deepdropDrop,
  deepdropExpire,
  deepdropReel,
  ENGINE_TUNING,
  freshPlayer,
  KENO_BATCH_MAX,
  playerFromSave,
  minesAuto,
  minesBegin,
  minesCash,
  minesDig,
  minesProgress,
  playKeno,
  playPlinko,
  playRoulette,
  playSlot,
  jackpotState,
  jackpotsWon,
  JACKPOT_SEEDS,
  plinkoRound,
  readPlayer,
  room,
  type EngineContext,
  type KenoRound,
  type PlayerState,
} from '../src';

const ctx = (key = 'test'): EngineContext => ({ now: 1_000, tuning: ENGINE_TUNING, seed: (game, round) => `${key}:${game}:${round}` });
const TICKET = [3, 17, 22, 41, 58];

function play(state: PlayerState, rounds = 1, c = ctx()) {
  const out = playKeno(state, { ticket: TICKET, step: 0, room: 0, rounds }, c);
  if (!out.ok) throw new Error(out.error);
  return out;
}

describe('keno on the engine', () => {
  it('stakes the bet and pays what the round came to', () => {
    const start = freshPlayer('s');
    const { state, rounds } = play(start);
    const r = rounds[0]!;
    expect(r.bet).toBe('5');
    expect(bankOf(state).toNumber()).toBeCloseTo(500 + 5 * r.net, 6);
    expect(state.keno.round).toBe(1);
    expect(state.stats.games.keno?.rounds).toBe(1);
  });

  it('draws from the seed it reports, so a replay is exact', () => {
    const { rounds } = play(freshPlayer('s'), 5);
    for (const r of rounds) expect(kenoDraw({ run: r.replay.run, round: r.replay.round })).toEqual(r.balls);
  });

  it('decides the same draws from the same seeds, and different ones from another key', () => {
    const a = play(freshPlayer('s'), 5).rounds.map((r) => r.balls);
    const b = play(freshPlayer('s'), 5).rounds.map((r) => r.balls);
    const c = play(freshPlayer('s'), 5, ctx('other')).rounds.map((r) => r.balls);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('refuses a bad ticket or bet', () => {
    const s = freshPlayer('s');
    expect(playKeno(s, { ticket: [], step: 0, room: 0 }, ctx()).ok).toBe(false);
    expect(playKeno(s, { ticket: [1, 1], step: 0, room: 0 }, ctx()).ok).toBe(false);
    expect(playKeno(s, { ticket: [81], step: 0, room: 0 }, ctx()).ok).toBe(false);
    expect(playKeno(s, { ticket: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], step: 0, room: 0 }, ctx()).ok).toBe(false);
    expect(playKeno(s, { ticket: [1], step: 99, room: 0 }, ctx()).ok).toBe(false);
  });

  it('never plays a room that is not open, and steps the bet down to the bank', () => {
    const s = { ...freshPlayer('s'), bank: '12' };
    const out = playKeno(s, { ticket: TICKET, step: 7, room: 5 }, ctx());
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.rounds[0]!.room).toBe(0);
    expect(out.rounds[0]!.bet).toBe('10');
  });

  it('refuses when the bank cannot cover the least bet', () => {
    const out = playKeno({ ...freshPlayer('s'), bank: '4' }, { ticket: TICKET, step: 0, room: 0 }, ctx());
    expect(out.ok).toBe(false);
  });

  it('plays a batch, at most the cap', () => {
    const { rounds, state } = play({ ...freshPlayer('s'), bank: '1e9' }, 50);
    expect(rounds).toHaveLength(KENO_BATCH_MAX);
    expect(state.keno.round).toBe(KENO_BATCH_MAX);
    // Each round's "after" is the state as of that round.
    expect(rounds.at(-1)!.after.bank).toBe(state.bank);
  });

  it('ends a batch on a stop rule', () => {
    const out = playKeno({ ...freshPlayer('s'), bank: '1e9' }, { ticket: TICKET, step: 0, room: 0, rounds: 10, stop: { above: '1' } }, ctx());
    expect(out.ok && out.rounds.length).toBe(1);
  });

  it('keeps a waiting buff at the bet that earned it, and plays a Free Draw on the house', () => {
    let state: PlayerState = { ...freshPlayer('s'), bank: '1e12', floor: { current: 2, best: 4 } };
    state = { ...state, keno: { ...state.keno, buffs: { ...state.keno.buffs, queue: [{ kind: 'freeDraws', left: 2 }] }, locked: { room: 2, step: 3 } } };
    const out = playKeno(state, { ticket: TICKET, step: 0, room: 0 }, ctx());
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const r = out.rounds[0]!;
    expect(r.onHouse).toBe(true);
    expect(r.room).toBe(2);
    expect(r.step).toBe(3);
    expect(r.bet).toBe(room(2).min.mul(5).toString());
    // Nothing staked: the bank only grows.
    expect(bankOf(out.state).gte(new Decimal('1e12'))).toBe(true);
    expect(out.state.keno.buffs.queue[0]).toEqual({ kind: 'freeDraws', left: 1 });
  });

  it('records a win with its replay and the after-state of every round', () => {
    const { rounds, state } = play({ ...freshPlayer('s'), bank: '1e9' }, 10);
    const won = rounds.filter((r: KenoRound) => r.after.win);
    expect(state.wins.keno?.length ?? 0).toBe(won.length);
    for (const r of won) expect(r.after.win!.replay).toEqual(r.replay);
  });

  it('pays back near the tuned payback over many draws', () => {
    let state: PlayerState = { ...freshPlayer('s'), bank: '1e15' };
    let staked = 0;
    let paid = 0;
    // A one-spot ticket: its pays are small, so 40,000 draws land close to the payback.
    for (let i = 0; i < 4000; i++) {
      const out = playKeno(state, { ticket: [7], step: 0, room: 0, rounds: 10 }, ctx());
      if (!out.ok) throw new Error(out.error);
      state = out.state;
      for (const r of out.rounds) {
        if (!r.onHouse) staked += 1;
        paid += r.x;
      }
    }
    // The ticket, the buffs and the pots together, at 97%, within the noise.
    expect(paid / staked).toBeGreaterThan(0.93);
    expect(paid / staked).toBeLessThan(1.01);
    expect(KENO_BUFFS.length).toBeGreaterThan(0);
  });
});

describe('charms on the engine', () => {
  it('pulls from the seed, spending Tokens', () => {
    const s = freshPlayer('s');
    const a = act(s, { type: 'charms.pull', count: 1 }, ctx());
    const b = act(s, { type: 'charms.pull', count: 1 }, ctx());
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.result).toEqual(b.result);
    expect(a.state.meta.tokens).toBe(STARTER_TOKENS - ENGINE_TUNING.pullCost);
    expect(a.state.meta.pulls).toBe(1);
  });

  it('refuses a pull it cannot pay for', () => {
    expect(act({ ...freshPlayer('s'), meta: { ...freshPlayer('s').meta, tokens: 1 } }, { type: 'charms.pull', count: 1 }, ctx()).ok).toBe(false);
  });

  it('equips only charms owned, into open slots', () => {
    const s = freshPlayer('s');
    expect(act(s, { type: 'charms.equip', id: 'horseshoe' }, ctx()).ok).toBe(false);
    const owned = { ...s, meta: { ...s.meta, collection: { horseshoe: 1 } } };
    const on = act(owned, { type: 'charms.equip', id: 'horseshoe' }, ctx());
    expect(on.ok && on.state.meta.loadout).toEqual(['horseshoe']);
    expect(act(owned, { type: 'charms.equip', id: 'horseshoe', slot: 3 }, ctx()).ok).toBe(false);
  });

  it('refuses the pit boss tools to anyone else', () => {
    const s = freshPlayer('s');
    expect(act(s, { type: 'admin.bank', set: '1e30' }, ctx()).ok).toBe(false);
    const done = act(s, { type: 'admin.bank', set: '1e30' }, ctx(), { admin: true });
    expect(done.ok && done.state.bank).toBe(new Decimal('1e30').toString());
  });

  it('buys back in only when broke', () => {
    expect(act(freshPlayer('s'), { type: 'buyIn' }, ctx()).ok).toBe(false);
    const broke = act({ ...freshPlayer('s'), bank: '2', floor: { current: 1, best: 3 } }, { type: 'buyIn' }, ctx());
    expect(broke.ok && broke.state.bank).toBe('500');
    expect(broke.ok && broke.state.floor).toEqual({ current: 0, best: 3 });
  });
});

describe('reading saves', () => {
  const wrap = (data: unknown) => JSON.stringify({ v: 1, data });

  it('moves a save from before the engine into one state', () => {
    const state = playerFromSave(
      {
        bank: wrap('12345'),
        floor: wrap({ current: 1, best: 2 }),
        meta: wrap({ tokens: 77, lifetimeTokens: 900, collection: { horseshoe: 3, nope: 4 }, loadout: ['horseshoe', 'nope'], pulls: 9, seed: 'abc', run: { winStreak: 2, lossStreak: 0, lastOutcome: 'win' }, hands: 40 }),
        stats: wrap({ since: 5, peakBank: '20000', games: { keno: { rounds: 3, wagered: '15', net: '-4', biggestWin: '6', bestX: 1.2, wins: 1, lastPlayed: 9 } } }),
        'wins.keno': wrap([{ round: 1, text: '3 of 5', net: '6', unit: '5', at: 1 }]),
        'keno.card': wrap([1, 2, 99]),
        'keno.rowPot': wrap('3.5'),
        'keno.buffs': wrap({ meters: { run: 2 }, queue: [{ kind: 'double', left: 1 }] }),
        'keno.picks': wrap([1, 2, 3]),
      },
      'fresh',
    );
    expect(state).not.toBeNull();
    expect(state!.bank).toBe('12345');
    expect(state!.floor).toEqual({ current: 1, best: 2 });
    expect(state!.meta.collection).toEqual({ horseshoe: 3 });
    expect(state!.meta.loadout).toEqual(['horseshoe', null]);
    expect(state!.meta.seed).toBe('abc');
    expect(state!.stats.games.keno?.net).toBe('-4');
    expect(state!.wins.keno).toHaveLength(1);
    expect(state!.keno.card).toEqual([1, 2]);
    expect(state!.keno.rowPot).toBe('3.5');
    expect(state!.keno.buffs.queue).toEqual([{ kind: 'double', left: 1 }]);
  });

  it('finds nothing to move in a save with no player state', () => {
    expect(playerFromSave({ muted: wrap(true) }, 'x')).toBeNull();
  });

  it('reads junk as a fresh state', () => {
    const s = readPlayer({ bank: 'NaN', floor: { current: 9, best: -1 }, meta: { tokens: 'lots' }, keno: { card: 'x' } }, 'seed');
    expect(s.bank).toBe('500');
    expect(s.floor).toEqual({ current: 0, best: 0 });
    expect(s.meta.tokens).toBe(STARTER_TOKENS);
    expect(s.keno.card).toEqual([]);
  });
});

describe('lucky drop on the engine', () => {
  it('drops from the seed it reports, paying the slot', () => {
    const out = playPlinko({ ...freshPlayer('s'), bank: '1e9' }, { rows: 12, risk: 'medium', step: 0, room: 0, rounds: 5 }, ctx());
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.rounds).toHaveLength(5);
    for (const r of out.rounds) {
      expect(dropBall(12, { run: r.replay.run, round: r.replay.round })).toEqual({ path: r.ball.path, slot: r.ball.slot });
      expect(r.ball.x).toBeCloseTo(plinkoPays(12, 'medium', 0.97)[r.ball.slot]!, 9);
    }
    expect(plinkoRound(out.state)).toBe(5);
  });

  it('pays back near the tuned payback, Fever included', () => {
    let state: PlayerState = { ...freshPlayer('s'), bank: '1e15' };
    let paid = 0;
    let n = 0;
    let fevers = 0;
    for (let i = 0; i < 4000; i++) {
      const out = playPlinko(state, { rows: 8, risk: 'low', step: 0, room: 0, rounds: 12 }, ctx());
      if (!out.ok) throw new Error(out.error);
      state = out.state;
      for (const r of out.rounds) {
        n++;
        paid += r.x;
        if (r.golden) {
          fevers++;
          expect(r.fever).toHaveLength(5);
        }
      }
    }
    expect(fevers).toBeGreaterThan(0);
    expect(paid / n).toBeGreaterThan(0.94);
    expect(paid / n).toBeLessThan(1.0);
  });

  it('refuses a board that does not exist', () => {
    expect(playPlinko(freshPlayer('s'), { rows: 9 as 8, risk: 'medium', step: 0, room: 0 }, ctx()).ok).toBe(false);
  });
});

describe('dynamite dig on the engine', () => {
  it('stakes on the first move, and settles the board it dealt', () => {
    let state: PlayerState = freshPlayer('s');
    const begun = minesBegin(state, { bombs: 3, step: 0, room: 0 }, ctx());
    expect(begun.ok).toBe(true);
    if (!begun.ok) return;
    state = begun.state;
    expect(state.bank).toBe('495');
    const board = minesBoard(3, { run: ctx().seed('mines', 0), round: 0 });
    // Dig every safe square that isn't a cart, then cash out.
    const safe = board.map((t, i) => [t, i] as const).filter(([t]) => t === 'gem' || t === 'star').slice(0, 2);
    for (const [, i] of safe) {
      const dug = minesDig(state, i, ctx());
      expect(dug.ok).toBe(true);
      if (dug.ok) state = dug.state;
    }
    const cashed = minesCash(state, ctx());
    expect(cashed.ok).toBe(true);
    if (!cashed.ok) return;
    const r = cashed.rounds[0]!;
    expect(r.board).toEqual(board);
    expect(r.how).toBe('cashed');
    expect(bankOf(cashed.state).toNumber()).toBeCloseTo(500 + 5 * r.net, 6);
    expect(minesProgress(cashed.state).live).toBeNull();
  });

  it('loses the stake on dynamite', () => {
    let state: PlayerState = freshPlayer('s');
    const begun = minesBegin(state, { bombs: 3, step: 0, room: 0 }, ctx());
    if (!begun.ok) throw new Error();
    state = begun.state;
    const bomb = minesBoard(3, { run: ctx().seed('mines', 0), round: 0 }).indexOf('bomb');
    const out = minesDig(state, bomb, ctx());
    expect(out.ok && out.rounds[0]!.how).toBe('boom');
    expect(out.ok && out.state.bank).toBe('495');
  });

  it('will not dig before a round, twice, or off the board', () => {
    const s = freshPlayer('s');
    expect(minesDig(s, 0, ctx()).ok).toBe(false);
    const begun = minesBegin(s, { bombs: 3, step: 0, room: 0 }, ctx());
    if (!begun.ok) throw new Error();
    expect(minesDig(begun.state, 25, ctx()).ok).toBe(false);
    expect(minesBegin(begun.state, { bombs: 3, step: 0, room: 0 }, ctx()).ok).toBe(false);
  });

  it('pays back near the tuned payback on auto play, vault and carts included', () => {
    let state: PlayerState = { ...freshPlayer('s'), bank: '1e15' };
    let paid = 0;
    let n = 0;
    let vaults = 0;
    for (let i = 0; i < 6000; i++) {
      const out = minesAuto(state, { bombs: 6, digs: 2, step: 0, room: 0, rounds: 5 }, ctx());
      if (!out.ok) throw new Error(out.error);
      state = out.state;
      for (const r of out.rounds) {
        n++;
        paid += r.x;
        if (r.vault) vaults++;
      }
    }
    expect(vaults).toBeGreaterThan(0);
    expect(paid / n).toBeGreaterThan(0.94);
    expect(paid / n).toBeLessThan(1.0);
  });
});

describe('deep drop on the engine', () => {
  const at = (now: number, key = 'test'): EngineContext => ({ ...ctx(key), now });
  /** A key whose first line holds past 3×, and one whose first line snaps under 2×. */
  function keyWhere(test: (snap: number) => boolean): string {
    for (let i = 0; i < 500; i++) {
      const key = `k${i}`;
      const snap = crashPoint(crashLineRtp(0.97), { run: `${key}:deepdrop:0`, round: 0 });
      if (test(snap)) return key;
    }
    throw new Error('no key');
  }

  it('reels in a line by hand, no further than the line could have reached', () => {
    const key = keyWhere((s) => s >= 3);
    const dropped = deepdropDrop(freshPlayer('s'), { step: 0, room: 0, pace: 1 }, at(0, key));
    expect(dropped.ok && dropped.live).toBeTruthy();
    if (!dropped.ok) return;
    expect(dropped.state.bank).toBe('495');
    // Asks for 2.9× after 2.5 seconds: the line has only reached about 1.41×.
    const reeled = deepdropReel(dropped.state, 2.9, at(2500, key));
    expect(reeled.ok).toBe(true);
    if (!reeled.ok) return;
    const r = reeled.rounds[0]!;
    expect(r.landed).toBe(true);
    expect(r.at).toBeCloseTo(1.41, 2);
    expect(bankOf(reeled.state).toNumber()).toBeCloseTo(500 + 5 * r.net, 6);
  });

  it('loses a line reeled in past its snap, and calls it snapped only once the snap has passed', () => {
    const key = keyWhere((s) => s > 1.1 && s < 2);
    const dropped = deepdropDrop(freshPlayer('s'), { step: 0, room: 0, pace: 1 }, at(0, key));
    if (!dropped.ok) throw new Error();
    expect(deepdropExpire(dropped.state, at(100, key)).ok).toBe(false);
    const late = deepdropReel(dropped.state, 2, at(5100, key));
    expect(late.ok && late.rounds[0]!.landed).toBe(false);
    const expired = deepdropExpire(dropped.state, at(60_000, key));
    expect(expired.ok && expired.rounds[0]!.landed).toBe(false);
    expect(expired.ok && expired.state.bank).toBe('495');
  });

  it('pays back near the tuned payback on auto play, golden lines included', () => {
    let state: PlayerState = { ...freshPlayer('s'), bank: '1e15' };
    let paid = 0;
    let n = 0;
    for (let i = 0; i < 6000; i++) {
      const out = deepdropDrop(state, { step: 0, room: 0, pace: 1, target: 1.5, rounds: 8 }, ctx());
      if (!out.ok) throw new Error(out.error);
      state = out.state;
      for (const r of out.rounds) {
        n++;
        paid += r.x;
      }
    }
    expect(paid / n).toBeGreaterThan(0.95);
    expect(paid / n).toBeLessThan(0.99);
  });
});

describe('roulette on the engine', () => {
  it('spins from the seed it reports, paying the layout', () => {
    const out = playRoulette({ ...freshPlayer('s'), bank: '1e9' }, { layout: { red: '10', '17': '5' }, room: 0, rounds: 5 }, ctx());
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    for (const r of out.rounds) expect(rouletteSpin({ run: r.replay.run, round: r.replay.round })).toBe(r.pocket);
  });

  it('refuses bets that are not on the layout, or over the limits', () => {
    const s = freshPlayer('s');
    expect(playRoulette(s, { layout: { nope: '10' }, room: 0 }, ctx()).ok).toBe(false);
    expect(playRoulette(s, { layout: { red: '1' }, room: 0 }, ctx()).ok).toBe(false);
    expect(playRoulette(s, { layout: { red: '501' }, room: 0 }, ctx()).ok).toBe(false);
    expect(playRoulette(s, { layout: { red: '10.5' }, room: 0 }, ctx()).ok).toBe(false);
    expect(playRoulette({ ...s, bank: '20' }, { layout: { red: '50' }, room: 0 }, ctx()).ok).toBe(false);
    expect(playRoulette(s, { layout: { red: '10' }, room: 3 }, ctx()).ok).toBe(false);
  });

  it('pays back 36/37', () => {
    let state: PlayerState = { ...freshPlayer('s'), bank: '1e15' };
    let paid = 0;
    let n = 0;
    for (let i = 0; i < 8000; i++) {
      const out = playRoulette(state, { layout: { red: '10' }, room: 0, rounds: 5 }, ctx());
      if (!out.ok) throw new Error(out.error);
      state = out.state;
      for (const r of out.rounds) {
        n++;
        paid += r.x;
      }
    }
    expect(paid / n).toBeGreaterThan(0.96);
    expect(paid / n).toBeLessThan(0.985);
  });
});

describe('slots on the engine', () => {
  it('spins from the seed it reports, and grows the progressives', () => {
    const start = { ...freshPlayer('s'), bank: '1e9' };
    const out = playSlot(start, { machine: 'vault', step: 0, room: 0, rounds: 5 }, ctx(), false);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.rounds).toHaveLength(5);
    const again = playSlot(start, { machine: 'vault', step: 0, room: 0, rounds: 5 }, ctx(), false);
    expect(again.ok && again.rounds.map((r) => r.result.stops)).toEqual(out.rounds.map((r) => r.result.stops));
    expect(jackpotState(out.state).grand).toBeGreaterThan(JACKPOT_SEEDS.grand);
  });

  it('lands the bonus on the pit boss’s switch, and only for the pit boss', () => {
    const start = { ...freshPlayer('s'), bank: '1e9' };
    const boss = playSlot(start, { machine: 'forge', step: 0, room: 0, test: { forceFeature: true } }, ctx(), true);
    expect(boss.ok && boss.rounds[0]!.result.feature).toBeTruthy();
    const player = playSlot(start, { machine: 'forge', step: 0, room: 0, test: { forceFeature: true } }, ctx('x'), false);
    const plain = playSlot(start, { machine: 'forge', step: 0, room: 0 }, ctx('x'), false);
    expect(player.ok && plain.ok && player.rounds[0]!.result.stops).toEqual(plain.ok && plain.rounds[0]!.result.stops);
  });

  it('pays the Major once it is due', () => {
    const due = act({ ...freshPlayer('s'), bank: '1e9' }, { type: 'admin.jackpot', due: true }, ctx(), { admin: true });
    if (!due.ok) throw new Error();
    const out = playSlot(due.state, { machine: 'vault', step: 0, room: 0 }, ctx(), false);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const r = out.rounds[0]!;
    expect(r.mystery || jackpotsWon(r.result).includes('major')).toBe(true);
    expect(jackpotState(out.state).major).toBe(JACKPOT_SEEDS.major);
    expect(jackpotState(out.state).history[0]?.tier).toBe('major');
  });

  it('refuses a machine that does not exist', () => {
    expect(playSlot(freshPlayer('s'), { machine: 'nope', step: 0, room: 0 }, ctx(), false).ok).toBe(false);
  });
});
