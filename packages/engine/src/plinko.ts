import { dropBall, FEVER_BALLS, FEVER_LADDER, isGolden, plinkoPays, PLINKO_RISKS, PLINKO_ROWS, type PlinkoRisk, type PlinkoRows } from '@idlesuits/sim';
import { autoStops, badBet, batchSize, counter, fitBet, progressOf, settleInstant, withProgress, type AutoStop, type InstantSettled } from './instant';
import { bankOf, type BreakdownLine, type EngineContext } from './settle';
import type { PlayerState } from './state';

/** Most balls one request may drop: auto play asks for a handful and drops them on its own beat. */
export const PLINKO_BATCH_MAX = 12;

export interface PlinkoPlay {
  rows: PlinkoRows;
  risk: PlinkoRisk;
  step: number;
  room: number;
  /** Balls to drop; 1 when absent. */
  rounds?: number;
  stop?: AutoStop;
}

/** A ball kept with its win: enough to drop it again exactly. */
export interface PlinkoReplay {
  run: string;
  round: number;
  rows: PlinkoRows;
  risk: PlinkoRisk;
  bet: string;
  /** What it paid, in bets: the slot's multiplier, or the whole Fever. */
  x: number;
  golden: boolean;
}

/** One ball's fall: left (0) or right (1) at each row, its slot, and what that paid in bets. */
export interface PlinkoFall {
  path: (0 | 1)[];
  slot: number;
  x: number;
  /** What a Fever ball multiplied its slot by; 1 for the dropped ball. */
  boost: number;
}

/** One ball, decided: its fall, and Fever's free balls if it dropped golden. */
export interface PlinkoRound extends InstantSettled {
  rows: PlinkoRows;
  risk: PlinkoRisk;
  ball: PlinkoFall;
  golden: boolean;
  fever: PlinkoFall[];
  replay: PlinkoReplay;
}

export type PlinkoOutcome = { ok: true; state: PlayerState; rounds: PlinkoRound[] } | { ok: false; error: string };

/** The round number Lucky Drop's next ball takes. */
export function plinkoRound(state: PlayerState): number {
  return counter(progressOf(state, 'plinko'), 'round');
}

function dropOnce(state: PlayerState, play: PlinkoPlay, ctx: EngineContext): { state: PlayerState; round: PlinkoRound } | null {
  const fit = fitBet(state, play.room, play.step, ctx);
  if (!fit) return null;
  const round = plinkoRound(state);
  const run = ctx.seed('plinko', round);
  const seed = { run, round };
  const pays = plinkoPays(play.rows, play.risk, ctx.tuning.instantPayback / 100);
  const first = dropBall(play.rows, seed);
  const ball: PlinkoFall = { ...first, x: pays[first.slot]!, boost: 1 };
  const golden = isGolden(seed);
  // A golden ball sets off Fever: free balls on the same board, each from its own stream of the round's seed.
  const fever: PlinkoFall[] = golden
    ? FEVER_LADDER.map((boost, i) => {
        const fall = dropBall(play.rows, seed, i + 1);
        return { ...fall, x: pays[fall.slot]! * boost, boost };
      })
    : [];
  const x = ball.x + fever.reduce((sum, f) => sum + f.x, 0);
  const lines: BreakdownLine[] = golden
    ? [{ label: `Golden ball · ${ball.x.toFixed(2)}×`, amount: ball.x }, ...fever.map((f, i) => ({ label: `Fever ball ${i + 1} · ×${FEVER_LADDER[i]}`, amount: f.x }))]
    : [{ label: `Slot ${ball.slot + 1} · ${ball.x.toFixed(2)}×`, amount: ball.x }];
  const text = golden ? `Fever · ${x.toFixed(2)}×` : `${x >= 10 ? x.toFixed(0) : x.toFixed(2)}× slot`;
  const sub = golden ? `golden ball + ${FEVER_BALLS} free · ${play.rows} rows` : `${play.rows} rows · ${play.risk} risk`;
  const replay: PlinkoReplay = { run, round, rows: play.rows, risk: play.risk, bet: fit.bet.toString(), x, golden };
  const next = withProgress(state, 'plinko', { ...progressOf(state, 'plinko'), round: round + 1 });
  const done = settleInstant(next, { game: 'plinko', round, run, room: fit.room, step: fit.step, bet: fit.bet, x, lines, text, sub, replay }, ctx);
  return { state: done.state, round: { ...done.settled, rows: play.rows, risk: play.risk, ball, golden, fever, replay } };
}

/**
 * Lucky Drop: one ball, or a handful for auto play, each a round of its own,
 * decided as it drops: its path from its seed, and Fever's free balls with it
 * if it's golden. The table lets them fall and holds each result back until
 * its ball lands.
 */
export function playPlinko(state: PlayerState, play: PlinkoPlay, ctx: EngineContext): PlinkoOutcome {
  if (!(PLINKO_ROWS as readonly number[]).includes(play.rows)) return { ok: false, error: 'No board has that many rows.' };
  if (!PLINKO_RISKS.includes(play.risk)) return { ok: false, error: 'No board has that risk.' };
  const bad = badBet(play);
  if (bad) return { ok: false, error: bad };
  const want = batchSize(play.rounds, PLINKO_BATCH_MAX);
  const rounds: PlinkoRound[] = [];
  let current = state;
  for (let i = 0; i < want; i++) {
    const done = dropOnce(current, play, ctx);
    if (!done) break;
    current = done.state;
    rounds.push(done.round);
    if (autoStops(play.stop, done.round.net, bankOf(current))) break;
  }
  if (!rounds.length) return { ok: false, error: 'The bank can’t cover that bet.' };
  return { ok: true, state: current, rounds };
}
