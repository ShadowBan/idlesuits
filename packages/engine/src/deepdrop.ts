import { CRASH_CAP, crashAt, crashLineRtp, crashPoint, crashTimeTo, GOLD_X, isGoldenLine } from '@idlesuits/sim';
import { autoStops, badBet, batchSize, counter, fitBet, progressOf, settleInstant, withProgress, type AutoStop, type InstantSettled } from './instant';
import { amount } from './money';
import { bankOf, moveBank, type BreakdownLine, type EngineContext } from './settle';
import type { PlayerState } from './state';

/** Most lines one auto request may drop. */
export const DEEPDROP_BATCH_MAX = 8;
/** The lowest multiplier a line can be reeled in at: an instant snap is 1.00×. */
export const MIN_REEL = 1.01;
/** The paces a line can sink at: the table's deal speeds. */
export const DEEPDROP_PACES = [1, 2, 5] as const;
/**
 * A line by hand waits this long past its snap before it's called snapped,
 * so a reel-in sent just before the snap, still on its way, is honoured.
 */
export const SNAP_GRACE_MS = 300;

/** A line that was reeled in, kept with its win: enough to sink it again exactly. */
export interface CrashReplay {
  run: string;
  round: number;
  /** Where it was reeled in, and where it would have snapped. */
  at: number;
  snap: number;
  golden: boolean;
  bet: string;
}

/**
 * A line being played by hand. Its snap point isn't here: it comes from the
 * round's seed, which stays with the engine's host until the line is over.
 */
export interface DeepDropLive {
  round: number;
  bet: string;
  room: number;
  step: number;
  golden: boolean;
  /** The line's own payback, as tuned when it dropped. */
  rtp: number;
  pace: number;
  /** When it dropped, by the host's clock. */
  startedAt: number;
}

export interface DeepDropRound extends InstantSettled {
  landed: boolean;
  /** Where it ended (reeled in, or snapped), and where it would have snapped. */
  at: number;
  snap: number;
  golden: boolean;
  replay: CrashReplay;
}

export type DeepDropOutcome = { ok: true; state: PlayerState; live: DeepDropLive | null; rounds: DeepDropRound[] } | { ok: false; error: string };

const fail = (error: string): DeepDropOutcome => ({ ok: false, error });

export function deepdropProgress(state: PlayerState): { round: number; live: DeepDropLive | null } {
  const p = progressOf(state, 'deepdrop');
  const live = p.live && typeof p.live === 'object' ? (p.live as DeepDropLive) : null;
  return { round: counter(p, 'round'), live: live && typeof live.startedAt === 'number' ? live : null };
}

function save(state: PlayerState, round: number, live: DeepDropLive | null): PlayerState {
  return withProgress(state, 'deepdrop', { ...progressOf(state, 'deepdrop'), round, live });
}

/** Ends a line: landed at `at` (pays at × golden) or snapped. The stake is already down when `staked`. */
function settleLine(state: PlayerState, line: { round: number; bet: string; room: number; step: number; golden: boolean; rtp: number }, landed: boolean, at: number, auto: boolean, ctx: EngineContext, staked: boolean) {
  const run = ctx.seed('deepdrop', line.round);
  const snap = crashPoint(line.rtp, { run, round: line.round });
  const times = line.golden ? GOLD_X : 1;
  const x = landed ? at * times : 0;
  const bet = amount(line.bet);
  const gold = line.golden ? 'Golden line · ' : '';
  const text = landed ? `${gold}Reeled in ${at.toFixed(2)}×` : snap <= 1 ? `${gold}Snapped at once` : `${gold}Snapped at ${snap.toFixed(2)}×`;
  const sub = landed ? `line held to ${snap.toFixed(2)}×` : auto ? `auto play at ${at.toFixed(2)}×` : 'reeled by hand';
  const lines: BreakdownLine[] = landed ? [{ label: `Reeled in at ${at.toFixed(2)}×${line.golden ? `, golden ×${GOLD_X}` : ''}`, amount: x }] : [];
  const replay: CrashReplay = { run, round: line.round, at: landed ? at : snap, snap, golden: line.golden, bet: line.bet };
  const back = staked ? moveBank(state, bet, ctx.tuning) : state;
  const done = settleInstant(back, { game: 'deepdrop', round: line.round, run, room: line.room, step: line.step, bet, x, lines, text, sub, replay }, ctx);
  const round: DeepDropRound = { ...done.settled, landed, at: landed ? at : snap, snap, golden: line.golden, replay };
  return { state: done.state, round };
}

function hundredths(x: number): number {
  return Math.floor(x * 100 + 1e-9) / 100;
}

/**
 * Drops a line. With a `target` (auto play's marker) it's decided at once,
 * reeled in at the target if the line holds that long; a batch of `rounds`
 * lines can go together. Without one, the line is played by hand: the stake
 * goes down and the line sinks until `deepdropReel` or the snap.
 */
export function deepdropDrop(state: PlayerState, req: { step: number; room: number; pace: number; target?: number; rounds?: number; stop?: AutoStop }, ctx: EngineContext): DeepDropOutcome {
  const p = deepdropProgress(state);
  if (p.live) return fail('A line is already down.');
  const bad = badBet(req);
  if (bad) return fail(bad);
  const pace = (DEEPDROP_PACES as readonly number[]).includes(req.pace) ? req.pace : 1;
  const rtp = crashLineRtp(ctx.tuning.instantPayback / 100);
  if (req.target === undefined) {
    const fit = fitBet(state, req.room, req.step, ctx);
    if (!fit) return fail('The bank can’t cover that bet.');
    const run = ctx.seed('deepdrop', p.round);
    const live: DeepDropLive = { round: p.round, bet: fit.bet.toString(), room: fit.room, step: fit.step, golden: isGoldenLine({ run, round: p.round }), rtp, pace, startedAt: ctx.now };
    let next = moveBank(state, fit.bet.neg(), ctx.tuning);
    next = save({ ...next, floor: { ...next.floor, current: fit.room } }, p.round + 1, live);
    // An instant snap is over before it starts.
    if (crashPoint(rtp, { run, round: p.round }) <= 1) return deepdropExpire(next, ctx);
    return { ok: true, state: next, live, rounds: [] };
  }
  if (typeof req.target !== 'number' || !Number.isFinite(req.target) || req.target < MIN_REEL || req.target > CRASH_CAP) return fail('Set the marker between 1.01× and the cap.');
  const target = hundredths(req.target);
  const want = batchSize(req.rounds, DEEPDROP_BATCH_MAX);
  const rounds: DeepDropRound[] = [];
  let current = state;
  for (let i = 0; i < want; i++) {
    const fit = fitBet(current, req.room, req.step, ctx);
    if (!fit) break;
    const round = deepdropProgress(current).round;
    const run = ctx.seed('deepdrop', round);
    const snap = crashPoint(rtp, { run, round });
    const line = { round, bet: fit.bet.toString(), room: fit.room, step: fit.step, golden: isGoldenLine({ run, round }), rtp };
    // The line only snaps once past its point: at the point itself it can still be reeled in.
    const done = settleLine(save(current, round + 1, null), line, snap >= target, target, true, ctx, false);
    current = done.state;
    rounds.push(done.round);
    if (autoStops(req.stop, done.round.net, bankOf(current))) break;
  }
  if (!rounds.length) return fail('The bank can’t cover that bet.');
  return { ok: true, state: current, live: null, rounds };
}

/** When the line by hand snaps, by the host's clock (its grace included); null if no line is down. */
export function deepdropSnapsAt(state: PlayerState, ctx: EngineContext): number | null {
  const live = deepdropProgress(state).live;
  if (!live) return null;
  const snap = crashPoint(live.rtp, { run: ctx.seed('deepdrop', live.round), round: live.round });
  return live.startedAt + (snap <= 1 ? 0 : crashTimeTo(snap) / live.pace + SNAP_GRACE_MS);
}

/**
 * Reels in the line played by hand at `at`, the multiplier the player saw.
 * It can't be more than the line could have reached by now, by the host's
 * clock (the player's view runs behind it, never ahead). Paid if the line
 * holds that far; snapped otherwise.
 */
export function deepdropReel(state: PlayerState, at: number, ctx: EngineContext): DeepDropOutcome {
  const p = deepdropProgress(state);
  const live = p.live;
  if (!live) return fail('No line is down.');
  if (typeof at !== 'number' || !Number.isFinite(at)) return fail('Reel in at a multiplier.');
  const reached = crashAt((ctx.now - live.startedAt) * live.pace);
  const m = hundredths(Math.min(at, reached));
  if (m < MIN_REEL) return fail('The line has only just dropped.');
  const snapsAt = deepdropSnapsAt(state, ctx)!;
  const snap = crashPoint(live.rtp, { run: ctx.seed('deepdrop', live.round), round: live.round });
  const landed = ctx.now <= snapsAt && m <= snap;
  const done = settleLine(save(state, p.round, null), live, landed, m, false, ctx, true);
  return { ok: true, state: done.state, live: null, rounds: [done.round] };
}

/** Calls the line by hand snapped, once its snap (and grace) have passed. Refused before then. */
export function deepdropExpire(state: PlayerState, ctx: EngineContext): DeepDropOutcome {
  const p = deepdropProgress(state);
  const live = p.live;
  if (!live) return { ok: true, state, live: null, rounds: [] };
  if (ctx.now < deepdropSnapsAt(state, ctx)!) return fail('The line is still holding.');
  const done = settleLine(save(state, p.round, null), live, false, 0, false, ctx, true);
  return { ok: true, state: done.state, live: null, rounds: [done.round] };
}

/** The rounds Deep Drop's seeds are needed for: the line down, and the lines a batch could drop. */
export function deepdropRounds(state: PlayerState): { from: number } {
  const p = deepdropProgress(state);
  return { from: p.live?.round ?? p.round };
}
