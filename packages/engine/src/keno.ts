import {
  GOLD_BALL_X,
  KENO_CARD_SHARE,
  KENO_MAX_SPOTS,
  KENO_NUMBERS,
  KENO_ROW_SHARE,
  kenoAfterDraw,
  kenoBuffDef,
  kenoBuffOnDraw,
  kenoDraw,
  kenoSettle,
  kenoStamp,
  kenoTicketRtp,
  type CharmTrigger,
  type KenoBuffKind,
  type KenoDrawBuff,
  type KenoPattern,
  type KenoResult,
  type RoundReport,
} from '@idlesuits/sim';
import { amount, Decimal } from './money';
import { affordable, room } from './rooms';
import { bankOf, recordWin, settleRound, type BreakdownLine, type EngineContext } from './settle';
import type { KenoProgress, KenoWin, PlayerState, WinRecord } from './state';
import { roomTuningOf } from './tuning';

/** The bets an instant game takes, in the room's minimums. */
export const BET_STEPS = [1, 2, 3, 5, 10, 20, 50, 100] as const;

/** Most draws one request may play: auto play asks for a batch and animates it. */
export const KENO_BATCH_MAX = 10;

/** Rules that end an auto batch early, the same ones the table's auto play stops on. */
export interface AutoStop {
  /** Stop after a round that won this many bets or more. */
  winX?: number;
  /** Stop once the bank falls below this, or reaches this, in dollars. */
  below?: string;
  above?: string;
}

export interface KenoPlay {
  ticket: number[];
  /** Index into BET_STEPS, and the room to play in. */
  step: number;
  room: number;
  /** Draws to play, for auto play; 1 when absent. */
  rounds?: number;
  stop?: AutoStop;
}

/** What a draw left behind, for the table to show once the draw is on screen. */
export interface KenoAfter {
  bank: string;
  tokens: number;
  lifetimeTokens: number;
  best: number;
  current: number;
  keno: KenoProgress;
  /** The win it added to the list, if it won. */
  win?: WinRecord;
}

/** One draw, decided: everything the table needs to animate it and explain it. */
export interface KenoRound {
  round: number;
  /** The round's seed, kept in its replay. */
  run: string;
  ticket: number[];
  room: number;
  step: number;
  bet: string;
  /** A Free Draw: nothing staked. */
  onHouse: boolean;
  /** The buff the draw played under, and what it did. */
  buff?: KenoBuffKind;
  drawBuff: KenoDrawBuff;
  balls: number[];
  /** The ticket's own payback this draw was priced at. */
  ticketRtp: number;
  result: KenoResult;
  /** Numbers stamped on the Gold Card, rows it finished, whether it filled. */
  stamped: number[];
  rows: number[];
  full: boolean;
  /** What the pots paid, in dollars. */
  rowPaid: string;
  cardPaid: string;
  patterns: Partial<Record<KenoPattern, number[]>>;
  granted: KenoBuffKind[];
  /** In bets: the ticket and the pots together. */
  x: number;
  /** In bets: what the round came to, stake and charms included. */
  net: number;
  lines: BreakdownLine[];
  text: string;
  sub: string;
  tokens: number;
  triggers: CharmTrigger[];
  replay: KenoWin;
  after: KenoAfter;
}

export type KenoOutcome = { ok: true; state: PlayerState; rounds: KenoRound[] } | { ok: false; error: string };

/** A ticket as sent: one to ten different numbers on the board, sorted. Null if it isn't one. */
export function cleanTicket(raw: unknown): number[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > KENO_MAX_SPOTS) return null;
  if (!raw.every((n) => Number.isInteger(n) && n >= 1 && n <= KENO_NUMBERS)) return null;
  const ticket = [...new Set(raw as number[])].sort((a, b) => a - b);
  return ticket.length === raw.length ? ticket : null;
}

/** An auto batch's stop rules, checked after a round that came to `net` bets, with the bank after it. */
export function autoStops(stop: AutoStop | undefined, net: number, bank: Decimal): boolean {
  if (!stop) return false;
  if (typeof stop.winX === 'number' && stop.winX > 0 && net >= stop.winX) return true;
  if (stop.below !== undefined && bank.lt(amount(stop.below))) return true;
  if (stop.above !== undefined && amount(stop.above).gt(0) && bank.gte(amount(stop.above))) return true;
  return false;
}

/** One draw. Null if the bank can't cover it. */
function drawOnce(state: PlayerState, ticket: number[], wantRoom: number, wantStep: number, ctx: EngineContext): { state: PlayerState; round: KenoRound } | null {
  const t = ctx.tuning;
  const rt = roomTuningOf(t);
  const keno = state.keno;
  const head = keno.buffs.queue[0];
  const onHouse = head?.kind === 'freeDraws';
  const bank = bankOf(state);

  // While a buff waits, the bet stays the one that earned it; either way it steps down to what the bank covers.
  const asked = keno.locked ?? { room: wantRoom, step: wantStep };
  let roomIndex = Math.min(Math.max(0, asked.room), state.floor.best);
  let step = Math.min(Math.max(0, asked.step), BET_STEPS.length - 1);
  if (!onHouse) {
    roomIndex = affordable(bank, 1, roomIndex, rt);
    while (step > 0 && room(roomIndex, rt).min.mul(BET_STEPS[step]!).gt(bank)) step--;
  }
  const bet = room(roomIndex, rt).min.mul(BET_STEPS[step]!);
  if (!onHouse && bet.gt(bank)) return null;

  const round = keno.round;
  const run = ctx.seed('keno', round);
  const seed = { run, round };
  const balls = kenoDraw(seed);
  const buff = kenoBuffOnDraw(head?.kind, ticket, seed);
  const ticketRtp = kenoTicketRtp(t.instantPayback / 100, ticket.length);
  const result = kenoSettle(ticket, balls, ticketRtp, buff);

  // The Gold Card: a paid draw's shares go in the pots; then the stamps, and anything they finish pays.
  let rowPot = amount(keno.rowPot);
  let cardPot = amount(keno.cardPot);
  if (!onHouse) {
    rowPot = rowPot.add(bet.mul(KENO_ROW_SHARE));
    cardPot = cardPot.add(bet.mul(KENO_CARD_SHARE));
  }
  const marked = buff.free !== undefined ? [...ticket, buff.free] : ticket;
  const stamp = kenoStamp(new Set(keno.card), marked, balls);
  let rowPaid = new Decimal(0);
  let cardPaid = new Decimal(0);
  if (stamp.rows.length) {
    rowPaid = rowPot;
    rowPot = new Decimal(0);
  }
  if (stamp.full) {
    cardPaid = cardPot;
    cardPot = new Decimal(0);
  }
  const card = stamp.full ? [] : [...new Set([...keno.card, ...stamp.stamped])];

  // The meters: the buff this draw played under uses up a draw; a paid draw's patterns fill their meters.
  const after = kenoAfterDraw(keno.buffs, balls, !onHouse);
  const locked = after.state.queue.length ? (keno.locked ?? { room: roomIndex, step }) : null;
  const drawBuff: KenoDrawBuff = { free: buff.free, goldX: buff.goldX, times: buff.times };
  const draw = keno.draws + 1;

  const x = result.pay + rowPaid.add(cardPaid).div(bet).toNumber();
  const times = buff.times ?? 1;
  const goldX = buff.goldX ?? GOLD_BALL_X;
  const base = result.pay / times / (result.gold && result.pay > 0 ? goldX : 1);
  const lines: BreakdownLine[] = onHouse ? [] : [{ label: 'Bet', amount: -1 }];
  if (result.pay > 0) {
    lines.push({ label: `${result.hits.length} of ${ticket.length}${buff.free !== undefined ? ' with the free spot' : ''} · ${base.toFixed(2)}×`, amount: base });
    if (result.gold) lines.push({ label: `Gold ball · ×${goldX}${head?.kind === 'goldRush' ? ' (Gold Rush)' : ''}`, amount: base * (goldX - 1) });
    if (times > 1) lines.push({ label: `Double Up · ×${times}`, amount: result.pay - result.pay / times });
  }
  if (rowPaid.gt(0)) lines.push({ label: `Gold Card · ${stamp.rows.length === 1 ? 'row' : `${stamp.rows.length} rows`} done · Row pot`, amount: rowPaid.div(bet).toNumber() });
  if (cardPaid.gt(0)) lines.push({ label: 'Gold Card full · Card pot', amount: cardPaid.div(bet).toNumber() });

  let next: PlayerState = {
    ...state,
    floor: { ...state.floor, current: roomIndex },
    keno: { round: round + 1, draws: draw, card, rowPot: rowPot.toString(), cardPot: cardPot.toString(), buffs: after.state, locked },
  };

  // The round settles through the charms like any other: on the house, all it pays is won.
  const net = onHouse ? x : x - 1;
  const report: RoundReport = {
    game: 'keno',
    seed,
    // Stake 1 even on the house, as before: charms count a free draw's win like any other.
    bets: [{ kind: 'main', stake: 1, net }],
    outcome: net > 0 ? 'win' : net === 0 ? 'push' : 'lose',
  };
  const settled = settleRound(next, report, bet, net, ctx);
  next = settled.state;
  lines.push(...settled.lines);
  const units = net + settled.extra;

  const tag = head ? ` · ${kenoBuffDef(head.kind).name}` : '';
  const card$ = stamp.full ? ' · card full!' : stamp.rows.length ? ' · row!' : '';
  const text = `${result.hits.length} of ${ticket.length}${result.gold ? ' · gold' : ''}${tag}${card$}`;
  const sub = x > 0 ? `${x >= 10 ? x.toFixed(0) : x.toFixed(2)}×` : 'no win';
  const replay: KenoWin = {
    run,
    round,
    draw,
    ticket,
    bet: bet.toString(),
    pay: x,
    hits: result.hits.length,
    gold: result.gold,
    rows: stamp.rows.length,
    full: stamp.full,
    buff: head?.kind,
    drawBuff: buff.free !== undefined || buff.goldX || buff.times ? drawBuff : undefined,
  };
  const money = bet.mul(units);
  let win: WinRecord | undefined;
  if (money.gt(0)) {
    win = { round: draw, text, sub, net: money.toString(), unit: bet.toString(), at: ctx.now, replay };
    next = recordWin(next, 'keno', win);
  }

  return {
    state: next,
    round: {
      round,
      run,
      ticket,
      room: roomIndex,
      step,
      bet: bet.toString(),
      onHouse,
      buff: head?.kind,
      drawBuff,
      balls,
      ticketRtp,
      result,
      stamped: stamp.stamped,
      rows: stamp.rows,
      full: stamp.full,
      rowPaid: rowPaid.toString(),
      cardPaid: cardPaid.toString(),
      patterns: after.patterns,
      granted: after.granted,
      x,
      net: units,
      lines,
      text,
      sub,
      tokens: settled.tokens,
      triggers: settled.triggers,
      replay,
      after: {
        bank: next.bank,
        tokens: next.meta.tokens,
        lifetimeTokens: next.meta.lifetimeTokens,
        best: next.floor.best,
        current: next.floor.current,
        keno: next.keno,
        win,
      },
    },
  };
}

/**
 * Plays Keno: one draw, or up to KENO_BATCH_MAX for auto play, each on the
 * same ticket. A batch ends early when the bank can't cover the next draw or
 * one of the stop rules is met, so no draw is played that the table's auto
 * play wouldn't have played.
 */
export function playKeno(state: PlayerState, play: KenoPlay, ctx: EngineContext): KenoOutcome {
  const ticket = cleanTicket(play.ticket);
  if (!ticket) return { ok: false, error: 'Mark one to ten numbers.' };
  if (!Number.isInteger(play.step) || play.step < 0 || play.step >= BET_STEPS.length) return { ok: false, error: 'That bet isn’t offered.' };
  if (!Number.isInteger(play.room) || play.room < 0) return { ok: false, error: 'That room isn’t open.' };
  const want = Math.min(KENO_BATCH_MAX, Math.max(1, Math.floor(play.rounds ?? 1)));
  const rounds: KenoRound[] = [];
  let current = state;
  for (let i = 0; i < want; i++) {
    const done = drawOnce(current, ticket, play.room, play.step, ctx);
    if (!done) break;
    current = done.state;
    rounds.push(done.round);
    if (autoStops(play.stop, done.round.net, bankOf(current))) break;
  }
  if (!rounds.length) return { ok: false, error: 'The bank can’t cover that bet.' };
  return { ok: true, state: current, rounds };
}
