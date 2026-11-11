import { crashTimeTo } from '@idlesuits/sim';
import { act, type Action, type ActOutcome } from './act';
import type { AutoStop } from './instant';
import { amount, Decimal } from './money';
import type { EngineContext } from './settle';
import type { PlayerState } from './state';

/**
 * Auto play on the host's clock. An idle game is left running for days, so
 * auto play doesn't wait on the player's browser: turning it on stores what
 * to play (the game's batch action, its stop rules) and when it started, and
 * rounds come due at the game's own pace. Any request settles every round
 * that's due, so a browser watching asks about once a minute and shows that
 * minute's rounds, a minute behind; one left closed asks nothing, and settles
 * everything when it's back (up to AWAY_CAP of time away).
 */

/** How far ahead auto play starts: the first answer brings this much play to show while the next comes due. */
export const AUTO_LEAD_MS = 60_000;
/** Time away that counts: past this since the player last checked in, auto play stops and waits for them. */
export const AWAY_CAP_MS = 72 * 3_600_000;
/** Most rounds one request settles; a long time away takes a few requests to catch up. */
export const AUTO_SYNC_MAX = 5_000;
/** Speeds a player can watch at: the rounds come that much faster. */
export const AUTO_SPEEDS = [1, 2, 5] as const;

/** Each game's pace on auto play, in milliseconds a round at normal speed: about what the table takes to show one. */
const PACE_MS: Record<string, number> = {
  keno: 4_800,
  plinko: 1_000,
  mines: 2_900,
  roulette: 6_000,
  vault: 2_400,
  forge: 2_400,
  haul: 2_400,
  carnival: 2_400,
  lanterns: 2_400,
  blackjack: 4_800,
  baccarat: 3_400,
  uth: 6_000,
  tcp: 4_500,
  csp: 5_000,
  c4p: 5_000,
  stud: 5_500,
  lir: 5_000,
  djwild: 5_000,
  paigow: 5_500,
  suits: 4_800,
};

/** The batch action each game's auto play repeats. */
const ACTION_OF: Record<string, Action['type']> = {
  keno: 'keno.play',
  plinko: 'plinko.play',
  mines: 'mines.auto',
  deepdrop: 'deepdrop.drop',
  roulette: 'roulette.spin',
  vault: 'slot.spin',
  forge: 'slot.spin',
  haul: 'slot.spin',
  carnival: 'slot.spin',
  lanterns: 'slot.spin',
};
/** Rounds one batch of each kind may hold. */
const BATCH_OF: Record<string, number> = { 'keno.play': 10, 'plinko.play': 12, 'mines.auto': 5, 'deepdrop.drop': 8, 'roulette.spin': 5, 'slot.spin': 5, 'table.auto': 5 };
const TABLES = ['blackjack', 'baccarat', 'uth', 'tcp', 'csp', 'c4p', 'stud', 'lir', 'djwild', 'paigow', 'suits'];

/** Auto play as the state keeps it. */
export interface AutoSession {
  game: string;
  /** The game's batch action, played over and over (its `rounds` set as due). */
  action: Record<string, unknown> & { type: string };
  stop?: AutoStop;
  /** Stop after this many rounds, if set. */
  limit?: number;
  /** Milliseconds a round. */
  pace: number;
  /** Rounds are settled up to this time, by the host's clock. */
  last: number;
  /** When the player last checked in. */
  seen: number;
  /** Rounds settled since auto play started. */
  rounds: number;
  on: boolean;
  /** Why it stopped, if it did on its own. */
  reason?: string;
}

/** What a stretch of auto play came to, for "while you were away". */
export interface AutoSummary {
  game: string;
  rounds: number;
  /** Won less lost, in dollars. */
  net: string;
  /** The biggest single win, in dollars, and what it was. */
  biggest: { money: string; text: string } | null;
  /** The best win as a multiple of its bet, and what it was. */
  bestX: { x: number; text: string } | null;
  tokens: number;
  /** The stretch of time it covers. */
  from: number;
  to: number;
}

/** What an auto play request answers: the game's own rounds to show (the latest), what all of them came to, and where auto play stands. */
export interface AutoReply {
  auto: AutoSession | null;
  summary: AutoSummary | null;
  /** More rounds are due than one request settles: ask again straight away. */
  more: boolean;
}

export function autoSession(state: PlayerState): AutoSession | null {
  const a = state.auto as Partial<AutoSession> | null;
  if (!a || typeof a !== 'object' || typeof a.game !== 'string' || !a.action || typeof a.action !== 'object') return null;
  if (typeof a.pace !== 'number' || typeof a.last !== 'number' || typeof a.seen !== 'number') return null;
  return { rounds: 0, on: false, ...a } as AutoSession;
}

/** The pace for a game's auto play, at a speed: a Deep Drop line takes as long as it sinks to the marker. */
function paceFor(game: string, action: Record<string, unknown>, speed: number): number {
  const base = game === 'deepdrop' ? crashTimeTo(Number(action.target) || 2) + 1_600 : (PACE_MS[game] ?? 5_000);
  return Math.max(250, Math.round(base / speed));
}

/** The batch action a game's auto play repeats, as asked for; null if it isn't one. */
function cleanAction(game: string, raw: unknown): (Record<string, unknown> & { type: string }) | null {
  if (!raw || typeof raw !== 'object') return null;
  const action = { ...(raw as Record<string, unknown>) };
  const type = TABLES.includes(game) ? 'table.auto' : ACTION_OF[game];
  if (!type || action.type !== type) return null;
  if (type === 'table.auto' && action.game !== game) return null;
  if (type === 'slot.spin' && action.machine !== game) return null;
  if (type === 'deepdrop.drop' && typeof action.target !== 'number') return null;
  // The stop rules and the count are the session's.
  delete action.rounds;
  delete action.stop;
  return action as Record<string, unknown> & { type: string };
}

/** What one round came to, in dollars, and what it's called: from any game's round. */
export function roundMoney(r: Record<string, unknown>): { money: Decimal; x: number; text: string; tokens: number; game: string } {
  const settled = r.settled as Record<string, unknown> | null | undefined;
  if (settled) {
    const unit = amount(settled.unit);
    const blind = ((settled.blind as { money: string }[]) ?? []).reduce((sum, b) => sum.add(new Decimal(b.money)), new Decimal(0));
    const money = unit.mul(Number(settled.units)).add(blind);
    return { money, x: unit.gt(0) ? money.div(unit).toNumber() : 0, text: String(settled.text ?? ''), tokens: Number(settled.tokens) || 0, game: String(settled.game ?? '') };
  }
  return { money: amount(r.bet).mul(Number(r.net)), x: Number(r.net) || 0, text: String(r.text ?? ''), tokens: Number(r.tokens) || 0, game: String(r.game ?? r.machine ?? '') };
}

/** The rounds in an action's result, whatever its game, and a way to rebuild a result from some of them. */
function roundsOf(result: unknown): Record<string, unknown>[] {
  if (!result || typeof result !== 'object') return [];
  const r = result as { rounds?: unknown[]; plays?: unknown[] };
  return ((r.plays ?? r.rounds ?? []) as Record<string, unknown>[]).filter(Boolean);
}

/**
 * The result to show from a stretch of auto play: the game's own result for
 * its last `keep` rounds. Dynamite Dig's moves are split back into their rounds.
 */
function tailOf(results: unknown[], keep: number): Record<string, unknown> {
  const all = results.filter(Boolean) as Record<string, unknown>[];
  if (!all.length) return { rounds: [] };
  const first = all[0]!;
  if ('plays' in first) return { plays: all.flatMap((r) => r.plays as unknown[]).slice(-keep) };
  if ('steps' in first) {
    const groups: unknown[][] = [];
    for (const r of all) for (const step of r.steps as { kind: string }[]) (step.kind === 'begin' || !groups.length ? groups.push([step]) : groups.at(-1)!.push(step));
    const rounds = all.flatMap((r) => r.rounds as unknown[]);
    return { steps: groups.slice(-keep).flat(), rounds: rounds.slice(-keep) };
  }
  if ('live' in first) return { live: null, rounds: all.flatMap((r) => r.rounds as unknown[]).slice(-keep) };
  return { rounds: all.flatMap((r) => r.rounds as unknown[]).slice(-keep) };
}

export type AutoOutcome = { ok: true; state: PlayerState; result: Record<string, unknown> & AutoReply } | { ok: false; error: string };

/**
 * Settles every round of auto play that's come due (up to AUTO_SYNC_MAX this
 * request), and checks the player in. Returns the latest rounds to show
 * (about a minute's worth), and what all of them came to.
 */
export function autoSync(state: PlayerState, ctx: EngineContext, opts: { admin?: boolean } = {}): AutoOutcome {
  const session = autoSession(state);
  if (!session || !session.on) return { ok: true, state: session ? { ...state, auto: { ...session, seen: ctx.now } } : state, result: { auto: session, summary: null, more: false } };
  const end = Math.min(ctx.now, session.seen + AWAY_CAP_MS);
  let due = Math.max(0, Math.floor((end - session.last) / session.pace));
  if (session.limit !== undefined) due = Math.min(due, Math.max(0, session.limit - session.rounds));
  const more = due > AUTO_SYNC_MAX;
  due = Math.min(due, AUTO_SYNC_MAX);
  let current: PlayerState = state;
  let settledCount = 0;
  let reason: string | undefined;
  const results: unknown[] = [];
  let biggest: { money: Decimal; text: string } | null = null;
  let bestX: { x: number; text: string } | null = null;
  let tokens = 0;
  const bankBefore = amount(state.bank);
  const ask = (n: number): ActOutcome => act(current, { ...session.action, rounds: n, stop: session.stop } as unknown as Action, ctx, { ...opts, auto: true });
  while (settledCount < due) {
    const want = Math.min(due - settledCount, BATCH_OF[session.action.type] ?? 5);
    const out = ask(want);
    if (!out.ok) {
      reason = out.error;
      break;
    }
    current = out.state;
    const rounds = roundsOf(out.result);
    results.push(out.result);
    for (const r of rounds) {
      const m = roundMoney(r);
      tokens += m.tokens;
      if (m.money.gt(0) && (!biggest || m.money.gt(biggest.money))) biggest = { money: m.money, text: m.text };
      if (m.x > 0 && (!bestX || m.x > bestX.x)) bestX = { x: m.x, text: m.text };
    }
    settledCount += rounds.length;
    // Fewer rounds than asked: a stop rule, or the bank, ended it.
    if (rounds.length < want) {
      reason = 'a stop rule was met, or the bank ran short';
      break;
    }
    if (!rounds.length) break;
  }
  const stoppedAway = !reason && end < ctx.now && !more && settledCount === due;
  if (stoppedAway) reason = 'you were away more than 72 hours';
  const limitHit = session.limit !== undefined && session.rounds + settledCount >= session.limit;
  if (!reason && limitHit) reason = `${session.limit} rounds`;
  const on = !reason;
  const next: AutoSession = {
    ...session,
    last: on ? session.last + settledCount * session.pace : end,
    // Mid-catch-up the player hasn't seen it all yet: the time away still counts from when they left.
    seen: more ? session.seen : ctx.now,
    rounds: session.rounds + settledCount,
    on,
    reason,
  };
  // Show about a minute of the latest rounds; the rest are in the summary.
  const keep = Math.max(1, Math.ceil(AUTO_LEAD_MS / session.pace) + 2);
  const summary: AutoSummary | null = settledCount
    ? {
        game: session.game,
        rounds: settledCount,
        net: amount(current.bank).sub(bankBefore).toString(),
        biggest: biggest ? { money: biggest.money.toString(), text: biggest.text } : null,
        bestX,
        tokens,
        from: session.last,
        to: next.last,
      }
    : null;
  return { ok: true, state: { ...current, auto: next }, result: { ...tailOf(results, keep), auto: next, summary, more } };
}

/**
 * Starts auto play at a game: what to play, its stop rules and the speed
 * it's watched at. Whatever auto play was running settles and makes way.
 * It starts a minute ahead, so there's play to show straight away.
 */
export function autoStart(
  state: PlayerState,
  req: { game: string; action: unknown; stop?: AutoStop; limit?: number; speed?: number },
  ctx: EngineContext,
  opts: { admin?: boolean } = {},
): AutoOutcome {
  const action = typeof req.game === 'string' ? cleanAction(req.game, req.action) : null;
  if (!action) return { ok: false, error: 'That game can’t play itself.' };
  const settled = autoStop(state, ctx);
  if (!settled.ok) return settled;
  const speed = (AUTO_SPEEDS as readonly number[]).includes(Number(req.speed)) ? Number(req.speed) : 1;
  const pace = paceFor(req.game, action, speed);
  const limit = Number.isInteger(req.limit) && (req.limit as number) > 0 ? req.limit : undefined;
  const session: AutoSession = { game: req.game, action, stop: req.stop, limit, pace, last: ctx.now - AUTO_LEAD_MS, seen: ctx.now, rounds: 0, on: true };
  return autoSync({ ...settled.state, auto: session }, ctx, opts);
}

/**
 * Stops auto play. Rounds that came due since it last settled aren't played:
 * nothing about them was decided yet, so nothing is lost, and the player
 * isn't handed a minute of rounds they didn't see coming.
 */
export function autoStop(state: PlayerState, ctx: EngineContext): AutoOutcome {
  const session = autoSession(state);
  const stopped = session ? { ...session, on: false, seen: ctx.now } : null;
  return { ok: true, state: { ...state, auto: stopped }, result: { auto: stopped, summary: null, more: false } };
}

/** The actions that play a round by hand: one of them while auto play runs stops it first. */
export function playsRound(type: string): boolean {
  return /^(keno|plinko|mines|deepdrop|roulette|slot|table)\./.test(type) && type !== 'table.resume';
}
