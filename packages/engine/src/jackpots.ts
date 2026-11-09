import { MIDNIGHT_VAULT, Rng, type JackpotMeters } from '@idlesuits/sim';
import { counter, progressOf, withProgress } from './progress';
import type { EngineContext } from './settle';
import type { PlayerState } from './state';

/** Where the meters start, and go back to once hit, in total bets. */
export const JACKPOT_SEEDS: JackpotMeters = { major: MIDNIGHT_VAULT.jackpots.major, grand: MIDNIGHT_VAULT.jackpots.grand };
/** The Major must hit before it reaches this, in total bets. */
export const MAJOR_CAP = JACKPOT_SEEDS.major * 1.5;
/** What every round anywhere in the casino adds to each meter, in total bets, before the pit boss's growth knob. */
export const PER_HAND: JackpotMeters = { major: 0.003, grand: 0.04 };
/** What the rest of the link adds every second the casino is open: other players, as on a real bank of machines. */
export const PER_SECOND: JackpotMeters = { major: 0.002, grand: 0.01 };
/** The link only grows while the player is at it: no more than this many seconds count between rounds. */
const MAX_IDLE_SECONDS = 60;

/** A jackpot someone hit, for the floor's record. */
export interface JackpotHit {
  tier: 'major' | 'grand';
  /** The meter when it hit, in bets, and what it paid in dollars (as a string: it can be any size). */
  x: number;
  paid: string;
  machine: string;
  at: number;
  /** Won by the must-hit-by draw rather than coins. */
  mystery?: boolean;
}

/**
 * The progressive jackpots, linked across every machine: in multiples of the
 * bet, so they mean the same in every room. The Major must hit by a hidden
 * point between its seed and its cap; the point comes from a secret seed (one
 * per Major hit), so it isn't kept here and can't be read from the state.
 */
export interface JackpotState {
  major: number;
  grand: number;
  /** Majors hit so far: which seed the hidden point comes from. */
  majorHits: number;
  history: JackpotHit[];
  /** When the meters last grew, by the host's clock. */
  at: number;
  /** The pit boss made the Major due on the next spin. */
  due?: boolean;
}

export function jackpotState(state: PlayerState): JackpotState {
  const p = progressOf(state, 'jackpots');
  const num = (v: unknown, lo: number, hi: number, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);
  return {
    major: num(p.major, JACKPOT_SEEDS.major, MAJOR_CAP, JACKPOT_SEEDS.major),
    grand: num(p.grand, JACKPOT_SEEDS.grand, Number.MAX_VALUE, JACKPOT_SEEDS.grand),
    majorHits: counter(p, 'majorHits'),
    history: Array.isArray(p.history) ? (p.history as JackpotHit[]).slice(0, 10) : [],
    at: typeof p.at === 'number' ? p.at : 0,
    due: p.due === true,
  };
}

export function withJackpots(state: PlayerState, j: JackpotState): PlayerState {
  return withProgress(state, 'jackpots', j as unknown as Record<string, unknown>);
}

/** The meters after the time since they last grew (a minute at most) and, for a settled round, its share. */
export function growJackpots(state: PlayerState, ctx: EngineContext, round: boolean): PlayerState {
  const j = jackpotState(state);
  const rate = ctx.tuning.jackpotGrowth;
  const seconds = j.at ? Math.min(MAX_IDLE_SECONDS, Math.max(0, (ctx.now - j.at) / 1000)) : 0;
  const major = PER_SECOND.major * seconds + (round ? PER_HAND.major : 0);
  const grand = PER_SECOND.grand * seconds + (round ? PER_HAND.grand : 0);
  return withJackpots(state, { ...j, major: Math.min(MAJOR_CAP, j.major + major * rate), grand: j.grand + grand * rate, at: ctx.now });
}

/** Where the Major must hit: from the secret seed for this Major. */
export function majorAt(j: JackpotState, ctx: EngineContext): number {
  if (j.due) return JACKPOT_SEEDS.major;
  const u = new Rng(ctx.seed('jackpot', j.majorHits), 'major-at').next();
  return JACKPOT_SEEDS.major + u * (MAJOR_CAP - JACKPOT_SEEDS.major);
}

/** A machine hit a progressive: recorded, and the meter starts over from its seed. */
export function hitJackpot(state: PlayerState, hit: Omit<JackpotHit, 'at'>, ctx: EngineContext): PlayerState {
  const j = jackpotState(state);
  // Two hits on one spin still need times of their own: the list is keyed by them.
  const at = Math.max(ctx.now, (j.history[0]?.at ?? 0) + 1);
  return withJackpots(state, {
    ...j,
    [hit.tier]: JACKPOT_SEEDS[hit.tier],
    majorHits: hit.tier === 'major' ? j.majorHits + 1 : j.majorHits,
    due: hit.tier === 'major' ? false : j.due,
    history: [{ ...hit, at }, ...j.history].slice(0, 10),
  });
}
