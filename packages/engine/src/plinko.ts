import { dropBall, FEVER_BALLS, FEVER_LADDER, isGolden, plinkoPayback, plinkoPays, PLINKO_RISKS, PLINKO_ROWS, type PlinkoRisk, type PlinkoRows } from '@idlesuits/sim';
import { autoStops, badBet, batchSize, counter, fitBet, progressOf, settleInstant, withProgress, type AutoStop, type InstantSettled } from './instant';
import { amount, Decimal, formatMoney } from './money';
import { bankOf, type BreakdownLine, type EngineContext } from './settle';
import type { PlayerState } from './state';

/**
 * Prize Pins. Every pin a ball touches lights up, and stays lit between
 * visits. Each newly lit pin fills the board's light meter by its weight
 * (the rarer the pin, the more), and a full meter sets off Prize Pins: free
 * balls drop through a board where every pin holds a share of the Pin Pot,
 * the rare ones the most, and each ball collects every pin it touches (a pin
 * pays once). Then the board goes dark and starts again.
 *
 * The Pin Pot is cash, not a multiple of the bet: every ball puts PIN_SHARE
 * of its bet in, so lighting the board at a small bet and raising it before the
 * meter fills buys nothing. Whatever the free balls don't collect stays in the
 * pot for next time, so in the long run the pot pays back exactly what goes in;
 * the slots are trimmed by the same share, and the board pays the floor's payback.
 */
export const PIN_SHARE = 0.1;
export const PRIZE_BALLS = 10;
/** Meter targets, sized so Prize Pins comes about every 75 balls on each board. */
export const PIN_TARGET: Readonly<Record<PlinkoRows, number>> = { 8: 92, 12: 203, 16: 338 };

/** A pin's place in a board's list: row by row from the top, left to right. */
export function pinIndex(row: number, k: number): number {
  return (row * (row + 1)) / 2 + k;
}

const weights = new Map<number, { weight: number[]; share: number[] }>();
/** Each pin's weight on the light meter (how rare it is: log₂ of 1 in how many balls touch it), and its share of the pot in Prize Pins. */
export function pinTable(rows: PlinkoRows): { weight: number[]; share: number[] } {
  let t = weights.get(rows);
  if (!t) {
    const weight: number[] = [];
    for (let r = 0; r < rows; r++) {
      let binom = 1;
      for (let k = 0; k <= r; k++) {
        weight.push(Math.max(1, Math.round(Math.log2(2 ** r / binom))));
        binom = (binom * (r - k)) / (k + 1);
      }
    }
    const raw = weight.map((w) => w * w);
    const total = raw.reduce((a, b) => a + b, 0);
    t = { weight, share: raw.map((x) => x / total) };
    weights.set(rows, t);
  }
  return t;
}

/** The pins a ball touches on its way down: one in each row, where its path has taken it. */
export function pinsTouched(path: readonly (0 | 1)[]): number[] {
  let k = 0;
  return path.map((step, r) => {
    const pin = pinIndex(r, k);
    k += step;
    return pin;
  });
}

/** The light meter for a board's lit pins. */
export function pinMeter(rows: PlinkoRows, lit: readonly number[]): number {
  const { weight } = pinTable(rows);
  return lit.reduce((sum, pin) => sum + (weight[pin] ?? 0), 0);
}

/** The slots' own payback at the floor's payback `rtp`: the Pin Pot's share comes out of them. */
export function plinkoSlotRtp(rtp: number): number {
  return rtp - PIN_SHARE;
}

/** A board's whole payback: its slots and Fever, and the Pin Pot, which pays back all it takes in. */
export function plinkoBoardPayback(rows: PlinkoRows, risk: PlinkoRisk, rtp: number): number {
  return plinkoPayback(rows, risk, plinkoSlotRtp(rtp)) + PIN_SHARE;
}

/** One board's lights and pot. */
export interface PinBoard {
  lit: number[];
  pot: string;
}

/** Each board's lights and pot, by its rows. */
export function pinBoards(state: PlayerState): Record<PlinkoRows, PinBoard> {
  const raw = progressOf(state, 'plinko').boards as Record<string, Partial<PinBoard>> | undefined;
  const out = {} as Record<PlinkoRows, PinBoard>;
  for (const rows of PLINKO_ROWS) {
    const b = raw?.[rows];
    const count = (rows * (rows + 1)) / 2;
    const lit = Array.isArray(b?.lit) ? [...new Set(b!.lit.filter((n) => Number.isInteger(n) && n >= 0 && n < count))] : [];
    out[rows] = { lit, pot: amount(b?.pot).toString() };
  }
  return out;
}

/** Prize Pins as it played: each free ball's fall and the pins it collected, in dollars. */
export interface PrizePins {
  /** The pot as Prize Pins started, and what it paid in all. */
  pot: string;
  paid: string;
  balls: { path: (0 | 1)[]; slot: number; pins: { pin: number; won: string }[] }[];
}

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
  /** The pins this ball (and any Fever balls) lit, in the order they lit; the pot after its share went in. */
  lit: number[];
  pot: string;
  /** Prize Pins, if this ball filled the meter. */
  prize: PrizePins | null;
  /** The board's lights and pot after the round (dark again after Prize Pins). */
  board: PinBoard;
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
  const pays = plinkoPays(play.rows, play.risk, plinkoSlotRtp(ctx.tuning.instantPayback / 100));
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

  // The lights: every pin the ball (and Fever's balls) touched; the pot takes this ball's share.
  const boards = pinBoards(state);
  const board = boards[play.rows];
  const lit = new Set(board.lit);
  const fresh: number[] = [];
  for (const path of [ball.path, ...fever.map((f) => f.path)]) {
    for (const pin of pinsTouched(path)) {
      if (lit.has(pin)) continue;
      lit.add(pin);
      fresh.push(pin);
    }
  }
  let pot = amount(board.pot).add(fit.bet.mul(PIN_SHARE));
  const potIn = pot;
  let prize: PrizePins | null = null;
  let after: PinBoard = { lit: [...lit], pot: pot.toString() };
  if (pinMeter(play.rows, after.lit) >= PIN_TARGET[play.rows]) {
    // Prize Pins: every pin holds its share of the pot as it stands; each free ball collects the pins it touches.
    const { share } = pinTable(play.rows);
    const taken = new Set<number>();
    let paid = new Decimal(0);
    const balls = Array.from({ length: PRIZE_BALLS }, (_, i) => {
      const fall = dropBall(play.rows, seed, 100 + i);
      const pins = pinsTouched(fall.path)
        .filter((pin) => !taken.has(pin) && taken.add(pin))
        .map((pin) => {
          const won = potIn.mul(share[pin]!);
          paid = paid.add(won);
          return { pin, won: won.toString() };
        });
      return { ...fall, pins };
    });
    // What the free balls didn't collect stays in the pot; the board goes dark.
    pot = Decimal.max(0, potIn.sub(paid));
    prize = { pot: potIn.toString(), paid: paid.toString(), balls };
    after = { lit: [], pot: pot.toString() };
  }

  const prizeX = prize ? new Decimal(prize.paid).div(fit.bet).toNumber() : 0;
  const x = ball.x + fever.reduce((sum, f) => sum + f.x, 0) + prizeX;
  const lines: BreakdownLine[] = golden
    ? [{ label: `Golden ball · ${ball.x.toFixed(2)}×`, amount: ball.x }, ...fever.map((f, i) => ({ label: `Fever ball ${i + 1} · ×${FEVER_LADDER[i]}`, amount: f.x }))]
    : [{ label: `Slot ${ball.slot + 1} · ${ball.x.toFixed(2)}×`, amount: ball.x }];
  if (prize) lines.push({ label: `Prize Pins · ${formatMoney(new Decimal(prize.paid))} of ${formatMoney(potIn)}`, amount: prizeX });
  const text = prize ? `Prize Pins · ${formatMoney(new Decimal(prize.paid))}` : golden ? `Fever · ${x.toFixed(2)}×` : `${x >= 10 ? x.toFixed(0) : x.toFixed(2)}× slot`;
  const sub = golden ? `golden ball + ${FEVER_BALLS} free · ${play.rows} rows` : `${play.rows} rows · ${play.risk} risk`;
  const replay: PlinkoReplay = { run, round, rows: play.rows, risk: play.risk, bet: fit.bet.toString(), x: ball.x + fever.reduce((sum, f) => sum + f.x, 0), golden };
  const next = withProgress(state, 'plinko', { ...progressOf(state, 'plinko'), round: round + 1, boards: { ...boards, [play.rows]: after } });
  const done = settleInstant(next, { game: 'plinko', round, run, room: fit.room, step: fit.step, bet: fit.bet, x, lines, text, sub, replay }, ctx);
  return { state: done.state, round: { ...done.settled, rows: play.rows, risk: play.risk, ball, golden, fever, replay, lit: fresh, pot: potIn.toString(), prize, board: after } };
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
