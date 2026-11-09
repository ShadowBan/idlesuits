import { ruleTotal, type CharmTrigger, type RoundReport } from '@idlesuits/sim';
import { autoStops, batchSize, counter, progressOf, withProgress, type AutoStop } from './instant';
import { amount, Decimal } from './money';
import { room } from './rooms';
import { bankOf, equipped, moveBank, recordWin, settleRound, type BreakdownLine, type EngineContext } from './settle';
import type { PlayerState, WinRecord } from './state';
import { roomTuningOf } from './tuning';

/** Most rounds one auto request may play at a table. */
export const TABLE_BATCH_MAX = 5;

/** What a stepped round does next: ask the player, or it's over. */
export type TableStep<D = unknown, E = unknown, R = unknown> = { kind: 'decision'; events: E[]; decision: D } | { kind: 'done'; events: E[]; result: R };

/** One blind hand dealt beside the player's: its stake, and how it played out (all in, no decisions). */
export interface BlindDeal {
  /** Its main bet, in dollars, and its side bets in units of it. */
  unit: string;
  sides: Record<string, number>;
  /** What it put down, in its own units: main bets all in plus its side bets. */
  down: number;
}

/** A blind hand settled, for the table to turn over once the dealer shows. */
export interface BlindSettled {
  unit: string;
  /** What the hand was, for its seat to show: its cards and what it made. */
  show: unknown;
  /** Its net, in its own units, before charms, then after. */
  net: number;
  units: number;
  money: string;
  label: string;
}

/** What the table asks to play: its bets, as the game reads them. */
export interface TableDealRequest {
  room: number;
  /** The main bet, in dollars. */
  bet: string;
  /** Side bets, in dollars, by id. */
  sides?: Record<string, string>;
  /** Blind seats as the player set them: each matches the main bet, bets its own, or sits out. */
  blind?: { mode: 'match' | 'own' | 'out'; bet?: string; sides?: Record<string, string> }[];
  /** Anything else the game reads (Idle Suits' raise plan, say). */
  options?: Record<string, unknown>;
}

/** A round in play at a table. Its data rebuilds the round exactly; the seed stays with the engine's host. */
export interface TableLive {
  round: number;
  /** The game's own data for the round: bets in units, the shoe's place, and so on. */
  data: Record<string, unknown>;
  choices: unknown[];
  /** The main bet, in dollars, and what the player's hand has down, in units of it. */
  unit: string;
  down: number;
  blind: BlindDeal[];
}

/** A settled table round, as the table shows it at the end. */
export interface TableSettled {
  game: string;
  round: number;
  run: string;
  unit: string;
  /** The hand's net in units, before charms; then with the charms' cash. */
  net: number;
  units: number;
  /** What the round paid back in all, the blind hands included: the stakes back and the winnings. */
  money: string;
  /** The charms' lines, Tokens and triggers. */
  lines: BreakdownLine[];
  tokens: number;
  triggers: CharmTrigger[];
  blind: BlindSettled[];
  text: string;
  sub: string;
  after: { bank: string; tokens: number; lifetimeTokens: number; best: number; current: number; win?: WinRecord };
}

/** What a table action returns: the events since the last, and the next decision or the settled round. */
export interface TablePlay<D = unknown, E = unknown, R = unknown> {
  events: E[];
  decision: D | null;
  result: R | null;
  settled: TableSettled | null;
  /** The round's blind hands as they sit face down: their stakes. */
  blind: BlindDeal[];
  /** What the table shows about the round besides its events: the shoe's place, a fresh shuffle. */
  info: Record<string, unknown>;
}

/** How the engine plays one table game: its bets, its rounds, and what they're worth. */
export interface TableAdapter<D = unknown, C = unknown, E = unknown, R = unknown> {
  game: string;
  /** The side bets the table takes, by id. */
  sides(ctx: EngineContext): readonly string[];
  /** Main bets a blind hand plays all in, in units (UTH's ante, blind and 4× play: 6). Zero: no blind hands here. */
  blindMain: number;
  /**
   * Checks the bets and builds the round's data, from the request, the
   * round's seed and the state (its shoe, say). Returns the player's own bet:
   * the main bet and the units down at the deal (sides included). A string is
   * what's wrong.
   */
  open(state: PlayerState, req: TableDealRequest, seed: string, ctx: EngineContext, seat: { index: number; of: number }): { data: Record<string, unknown>; down: number } | string;
  /** Plays the round from its data with the choices so far. The round's seed comes from `ctx` and `data.round`. */
  step(data: Record<string, unknown>, choices: readonly C[], ctx: EngineContext): TableStep<D, E, R>;
  /** Plays one blind hand all in, from the round's seed and its seat; its show data, net and report. */
  blindHand?(data: Record<string, unknown>, sides: Record<string, number>, seat: { index: number; of: number }, ctx: EngineContext): { show: unknown; label: string; net: number; report: Omit<RoundReport, 'game' | 'seed'> };
  /**
   * The decision as the player may answer it, with what the bank can cover:
   * `afford(units)` says whether another `units` of the main bet can go down.
   */
  offer(decision: D, data: Record<string, unknown>, afford: (units: number) => boolean, ctx: EngineContext): D;
  /** Units a choice puts down, or null if it isn't one of the offered choices. */
  cost(decision: D, choice: C, data: Record<string, unknown>): number | null;
  /** What auto play chooses. */
  suggest(decision: D, data: Record<string, unknown>, ctx: EngineContext): C;
  /** The settled round as the charms see it, its net in units, and what the wins list calls it. */
  report(result: R, data: Record<string, unknown>): { report: Omit<RoundReport, 'game' | 'seed'>; net: number; text: string; sub: string };
  /** Hides what the player hasn't seen yet (a hole card) while the round is undecided. */
  redact?(events: E[]): E[];
  /** What the table shows about the round besides its events (the shoe's place, a fresh shuffle). */
  info?(data: Record<string, unknown>, ctx: EngineContext): Record<string, unknown>;
  /** After a round settles: the shoe moves on, the game's own progress. */
  after?(progress: Record<string, unknown>, data: Record<string, unknown>, result: R): Record<string, unknown>;
}

const adapters = new Map<string, TableAdapter>();

export function registerTable(adapter: TableAdapter<any, any, any, any>) {
  adapters.set(adapter.game, adapter as TableAdapter);
}

export function tableAdapter(game: string): TableAdapter | undefined {
  return adapters.get(game);
}

export function tableGames(): string[] {
  return [...adapters.keys()];
}

export function tableProgress(state: PlayerState, game: string): { round: number; live: TableLive | null; progress: Record<string, unknown> } {
  const p = progressOf(state, game);
  const live = p.live && typeof p.live === 'object' ? (p.live as TableLive) : null;
  return { round: counter(p, 'round'), live: live && Array.isArray(live.choices) ? live : null, progress: p };
}

/** A sum of dollars sent for a bet: whole dollars, at least zero. */
export function dollars(v: unknown): Decimal | null {
  try {
    const d = new Decimal(typeof v === 'string' || typeof v === 'number' ? v : NaN);
    return d.isFinite() && !d.isNan() && d.gte(0) ? d : null;
  } catch {
    return null;
  }
}

/**
 * The table's bets checked against the room: the main bet between its
 * minimum and maximum, each side bet up to the side maximum. The sides come
 * back in units of the main bet.
 */
export function checkBets(state: PlayerState, req: TableDealRequest, ctx: EngineContext, sideIds: readonly string[]): { unit: Decimal; sides: Record<string, number> } | string {
  if (!Number.isInteger(req.room) || req.room < 0 || req.room > state.floor.best) return 'That room isn’t open.';
  const r = room(req.room, roomTuningOf(ctx.tuning));
  const unit = dollars(req.bet);
  if (!unit || unit.lt(r.min) || unit.gt(r.max)) return 'The bet is outside the table’s limits.';
  const sides: Record<string, number> = {};
  for (const [id, v] of Object.entries(req.sides ?? {})) {
    if (!sideIds.includes(id)) return 'There’s no such side bet here.';
    const d = dollars(v);
    if (!d) return 'A side bet isn’t an amount.';
    if (d.gt(r.sideMax)) return 'A side bet is over the table’s side limit.';
    if (d.gt(0)) sides[id] = d.div(unit).toNumber();
  }
  return { unit, sides };
}

/** Units of side bets. */
export function sidesDown(sides: Readonly<Record<string, number>>): number {
  return Object.values(sides).reduce((a, b) => a + b, 0);
}

function saveLive(state: PlayerState, game: string, p: Record<string, unknown>): PlayerState {
  return withProgress(state, game, p);
}

/** The blind seats in play this round, each within the room's limits, while the bank covers every hand all in. */
function blindStakes(state: PlayerState, adapter: TableAdapter, req: TableDealRequest, mine: { unit: Decimal; sides: Record<string, number> }, seats: number, ctx: EngineContext, sideIds: readonly string[]): BlindDeal[] {
  if (!adapter.blindMain || seats <= 0) return [];
  const r = room(req.room, roomTuningOf(ctx.tuning));
  const exposure = (unit: Decimal, sides: Record<string, number>) => unit.mul(adapter.blindMain + sidesDown(sides));
  let total = exposure(mine.unit, mine.sides);
  const bank = bankOf(state);
  const out: BlindDeal[] = [];
  for (let i = 0; i < seats; i++) {
    const seat = req.blind?.[i] ?? { mode: 'match' as const };
    if (seat.mode === 'out') continue;
    let unit = mine.unit;
    let sides = mine.sides;
    if (seat.mode === 'own') {
      const asked = dollars(seat.bet) ?? r.min;
      unit = Decimal.min(Decimal.max(asked, r.min), r.max);
      sides = {};
      for (const [id, v] of Object.entries(seat.sides ?? {})) {
        const d = dollars(v);
        if (d && d.gt(0) && sideIds.includes(id)) sides[id] = Decimal.min(d, r.sideMax).div(unit).toNumber();
      }
    }
    if (bank.lt(total.add(exposure(unit, sides)))) break;
    total = total.add(exposure(unit, sides));
    out.push({ unit: unit.toString(), sides, down: adapter.blindMain + sidesDown(sides) });
  }
  return out;
}

/** Plays the round on from its choices, and settles it when it's over. */
function advance(state: PlayerState, adapter: TableAdapter, live: TableLive, shownBefore: number, ctx: EngineContext): { state: PlayerState; play: TablePlay } {
  const step = adapter.step(live.data, live.choices, ctx);
  const fresh = step.events.slice(shownBefore);
  if (step.kind === 'decision') {
    const bank = bankOf(state);
    const unit = amount(live.unit);
    const decision = adapter.offer(step.decision, live.data, (units) => bank.gte(unit.mul(units)), ctx);
    const events = adapter.redact ? adapter.redact(fresh) : fresh;
    return { state, play: { events, decision, result: null, settled: null, blind: live.blind, info: adapter.info?.(live.data, ctx) ?? {} } };
  }
  const settled = settleTable(state, adapter, live, step.result, ctx);
  return { state: settled.state, play: { events: fresh, decision: null, result: step.result, settled: settled.settled, blind: live.blind, info: adapter.info?.(live.data, ctx) ?? {} } };
}

/**
 * Settles a finished round: every blind hand, then the player's own, each
 * through the charms; the stakes come back and the nets go on. Then the
 * game's own progress (the shoe) moves on.
 */
function settleTable(state: PlayerState, adapter: TableAdapter, live: TableLive, result: unknown, ctx: EngineContext): { state: PlayerState; settled: TableSettled } {
  const game = adapter.game;
  const run = ctx.seed(game, live.round);
  const unit = amount(live.unit);
  const { progress } = tableProgress(state, game);
  let next = saveLive(state, game, { ...(adapter.after ? adapter.after(progress, live.data, result) : progress), round: live.round + 1, live: null });
  next = { ...next, floor: { ...next.floor, current: Number(live.data.room ?? next.floor.current) } };
  let money = new Decimal(0);
  const blind: BlindSettled[] = [];
  live.blind.forEach((b, i) => {
    const bu = amount(b.unit);
    const hand = adapter.blindHand!(live.data, b.sides, { index: i, of: live.blind.length + 1 }, ctx);
    next = moveBank(next, bu.mul(b.down), ctx.tuning);
    const out = settleRound(next, { ...hand.report, game, seed: { run, round: live.round } } as RoundReport, bu, hand.net, ctx);
    next = out.state;
    const units = hand.net + out.extra;
    const back = bu.mul(b.down + units);
    money = money.add(back);
    blind.push({ unit: b.unit, show: hand.show, net: hand.net, units, money: bu.mul(units).toString(), label: hand.label });
  });
  const r = adapter.report(result, live.data);
  // The player's stakes went down as they were made: they come back before the round settles its net.
  next = moveBank(next, unit.mul(live.down), ctx.tuning);
  const out = settleRound(next, { ...r.report, game, seed: { run, round: live.round } } as RoundReport, unit, r.net, ctx);
  next = out.state;
  const units = r.net + out.extra;
  money = money.add(unit.mul(live.down + units));
  let win: WinRecord | undefined;
  const total = unit.mul(units).add(blind.reduce((sum, b) => sum.add(new Decimal(b.money)), new Decimal(0)));
  if (total.gt(0)) {
    win = { round: live.round + 1, text: r.text, sub: r.sub, net: total.toString(), unit: unit.toString(), at: ctx.now };
    next = recordWin(next, game, win);
  }
  return {
    state: next,
    settled: {
      game,
      round: live.round,
      run,
      unit: live.unit,
      net: r.net,
      units,
      money: money.toString(),
      lines: out.lines,
      tokens: out.tokens,
      triggers: out.triggers,
      blind,
      text: r.text,
      sub: r.sub,
      after: { bank: next.bank, tokens: next.meta.tokens, lifetimeTokens: next.meta.lifetimeTokens, best: next.floor.best, current: next.floor.current, win },
    },
  };
}

export type TableOutcome = { ok: true; state: PlayerState; plays: TablePlay[] } | { ok: false; error: string };

const fail = (error: string): TableOutcome => ({ ok: false, error });

/** Deals a round: the bets go down (the blind hands' all in), and the round plays to the first decision. */
export function tableDeal(state: PlayerState, game: string, req: TableDealRequest, ctx: EngineContext): TableOutcome {
  const adapter = adapters.get(game);
  if (!adapter) return fail('No such table.');
  const t = tableProgress(state, game);
  if (t.live) return fail('Finish the hand on the table first.');
  const run = ctx.seed(game, t.round);
  const checked = checkBets(state, req, ctx, adapter.sides(ctx));
  if (typeof checked === 'string') return fail(checked);
  const blind = blindStakes(state, adapter, req, checked, blindSeatsFor(state, ctx), ctx, adapter.sides(ctx));
  const opened = adapter.open(state, { ...req, round: t.round } as TableDealRequest, run, ctx, { index: blind.length, of: blind.length + 1 });
  if (typeof opened === 'string') return fail(opened);
  const unit = checked.unit;
  const blindDown = blind.reduce((sum, b) => sum.add(amount(b.unit).mul(b.down)), new Decimal(0));
  const down = unit.mul(opened.down).add(blindDown);
  if (down.gt(bankOf(state))) return fail('The bank can’t cover those bets.');
  const live: TableLive = { round: t.round, data: { ...opened.data, room: req.room, round: t.round }, choices: [], unit: unit.toString(), down: opened.down, blind };
  let next = moveBank(state, down.neg(), ctx.tuning);
  next = saveLive(next, game, { ...t.progress, live });
  next = { ...next, floor: { ...next.floor, current: req.room } };
  const out = advance(next, adapter, live, 0, ctx);
  return { ok: true, state: out.state, plays: [out.play] };
}

/** The player's choice at the decision in front of them: checked, its bet put down, and the round played on. */
export function tableMove(state: PlayerState, game: string, choice: unknown, ctx: EngineContext): TableOutcome {
  const adapter = adapters.get(game);
  if (!adapter) return fail('No such table.');
  const t = tableProgress(state, game);
  const live = t.live;
  if (!live) return fail('There’s no hand on the table.');
  const step = adapter.step(live.data, live.choices, ctx);
  if (step.kind !== 'decision') return fail('The hand is already decided.');
  const bank = bankOf(state);
  const unit = amount(live.unit);
  const decision = adapter.offer(step.decision, live.data, (units) => bank.gte(unit.mul(units)), ctx);
  const cost = adapter.cost(decision, choice, live.data);
  if (cost === null) return fail('That move isn’t open here.');
  if (cost > 0 && bank.lt(unit.mul(cost))) return fail('The bank can’t cover that.');
  const moved: TableLive = { ...live, choices: [...live.choices, choice], down: live.down + cost };
  let next = cost > 0 ? moveBank(state, unit.mul(cost).neg(), ctx.tuning) : state;
  next = saveLive(next, game, { ...t.progress, live: moved });
  const out = advance(next, adapter, moved, step.events.length, ctx);
  return { ok: true, state: out.state, plays: [out.play] };
}

/** The hand on the table as it stands, from the start: to pick up where the player left off. */
export function tableResume(state: PlayerState, game: string, ctx: EngineContext): TableOutcome {
  const adapter = adapters.get(game);
  if (!adapter) return fail('No such table.');
  const live = tableProgress(state, game).live;
  if (!live) return { ok: true, state, plays: [] };
  const out = advance(state, adapter, live, 0, ctx);
  return { ok: true, state: out.state, plays: [out.play] };
}

/**
 * Auto play: whole rounds, each dealt and played out on the suggested moves,
 * up to TABLE_BATCH_MAX of them, stopping early when the bank can't cover the
 * bets or a stop rule is met.
 */
export function tableAuto(state: PlayerState, game: string, req: TableDealRequest & { rounds?: number; stop?: AutoStop }, ctx: EngineContext): TableOutcome {
  const adapter = adapters.get(game);
  if (!adapter) return fail('No such table.');
  const want = batchSize(req.rounds, TABLE_BATCH_MAX);
  const plays: TablePlay[] = [];
  let current = state;
  for (let n = 0; n < want; n++) {
    const dealt = tableDeal(current, game, req, ctx);
    if (!dealt.ok) {
      if (!plays.length) return dealt;
      break;
    }
    current = dealt.state;
    // One play per round: every event from the deal to the end.
    const round: TablePlay = { ...dealt.plays[0]!, events: [...dealt.plays[0]!.events] };
    for (let guard = 0; guard < 50 && round.decision !== null; guard++) {
      const live = tableProgress(current, game).live!;
      const choice = adapter.suggest(round.decision, live.data, ctx);
      const moved = tableMove(current, game, choice, ctx);
      if (!moved.ok) return moved;
      current = moved.state;
      const p = moved.plays[0]!;
      round.events.push(...p.events);
      round.decision = p.decision;
      round.result = p.result;
      round.settled = p.settled;
    }
    plays.push(round);
    if (round.settled && autoStops(req.stop, round.settled.units, bankOf(current))) break;
  }
  return { ok: true, state: current, plays };
}

/** Blind seats a poker table deals: as many as the charms give, or as the pit boss sets. */
export function blindSeatsFor(state: PlayerState, ctx: EngineContext): number {
  return ctx.tuning.blindHands >= 0 ? ctx.tuning.blindHands : ruleTotal(equipped(state), 'extraHands');
}

/** The round numbers a table's seeds are needed for, and its shoe's. */
export function tableSeeds(state: PlayerState, game: string): { from: number } {
  return { from: tableProgress(state, game).round };
}
