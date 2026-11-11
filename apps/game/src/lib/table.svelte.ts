import { tableProgress, type Action, type TableDealRequest, type TablePlay, type TableSettled } from '@idlesuits/engine';
import { autoplay } from './autoplay.svelte';
import { floor } from './floor.svelte';
import { meta } from './meta.svelte';
import { Decimal } from './money';
import { playOrAuto } from './autofeed.svelte';
import { player } from './player.svelte';

/** What a table action brought back: the plays to show, each settled one's money held back until it's shown. */
export interface TableReply {
  ok: boolean;
  error?: string;
  plays: TablePlay[];
  /** By play: the id its money is held back under, or null. */
  holds: (number | null)[];
  /** Call as a play starts on the table: its stake shows as down. */
  begin: (index: number) => void;
}

/**
 * Sends a table action to the engine (the server, for a member). A round it
 * settles has its money held off the screen until the table has shown it:
 * call `landSettled` then.
 */
export async function tableAct(action: Action, speed = 1): Promise<TableReply> {
  const before = player.shown.floor.best;
  let holds: (number | null)[] = [];
  const held = (p: TablePlay) =>
    p.settled ? { game: p.settled.game, bet: p.settled.unit, net: 0, onHouse: true, tokens: p.settled.tokens, money: p.settled.money, staked: p.settled.staked, after: p.settled.after } : null;
  const send = (landed: Parameters<typeof player.act>[1]) =>
    action.type === 'table.auto' ? playOrAuto(true, action.game, action as unknown as Record<string, unknown>, speed, landed!) : player.act(action, landed);
  const out = await send((landed) => {
    const plays = landed.result && 'plays' in landed.result ? landed.result.plays : [];
    // The first play's stake is already down (it was dealt by this action, or before); later ones' show as they start.
    holds = plays.map((p, i) => {
      const h = held(p);
      if (!h) return null;
      const id = player.holdBack([h], before)[0]!;
      if (i === 0) player.start(id, h);
      return id;
    });
  });
  if (!out.ok) return { ok: false, error: out.error, plays: [], holds: [], begin: () => {} };
  const plays = out.result && 'plays' in out.result ? out.result.plays : [];
  const begin = (i: number) => {
    const h = plays[i] ? held(plays[i]!) : null;
    if (h && holds[i] != null) player.start(holds[i]!, h);
  };
  return { ok: true, plays, holds, begin };
}

/** Side bets in units of the main bet, as the engine takes them: in dollars. */
export function sidesInDollars(units: Readonly<Record<string, number>>, bet: Decimal): Record<string, string> {
  return Object.fromEntries(Object.entries(units).filter(([, u]) => u > 0).map(([id, u]) => [id, bet.mul(u).toString()]));
}

/**
 * A settled round is on the table in full: its money shows, its charms flash,
 * and auto play's rules see it. Returns the charms' lines and what the hand
 * came to with them, blind hands aside, in units of the main bet.
 */
export function landSettled(settled: TableSettled, hold: number | null): { units: number; lines: TableSettled['lines']; money: Decimal } {
  if (hold !== null) player.reveal(hold);
  const unit = new Decimal(settled.unit);
  meta.showFlash(settled.triggers, settled.tokens, unit);
  const blindMoney = settled.blind.reduce((sum, b) => sum.add(new Decimal(b.money)), new Decimal(0));
  autoplay.round(settled.units + blindMoney.div(unit).toNumber(), player.bank);
  return { units: settled.units, lines: settled.lines, money: unit.mul(settled.units) };
}

/** How a table plays one round through the engine (see `playTable`). */
export interface TableRound<D, C> {
  game: string;
  /** The bets, as the engine takes them. */
  request: () => Omit<TableDealRequest, 'room'>;
  autoPlay: () => boolean;
  /** Waits between auto play's rounds. False if the table was reset. */
  wait: (ms: number) => Promise<boolean>;
  between: number;
  /** A round starts on the felt: its main bet, and the blind hands as dealt. */
  start: (play: TablePlay, unit: Decimal) => void;
  /** A round's result has come back, before it's shown: the blind hands' results go under their seats. */
  ready?: (play: TablePlay, unit: Decimal) => void;
  /** Shows events on the felt. False if the table was reset. */
  show: (events: unknown[], play: TablePlay) => Promise<boolean>;
  /** The decision in front of the player: their answer (the suggestion under auto play), or null if the table was reset. */
  decide: (decision: D, unit: Decimal) => Promise<C | null>;
  /** A round shown in full: it settles on the felt. */
  settled: (play: TablePlay, hold: number | null, unit: Decimal) => void;
  /** The engine turned the round down. */
  failed: (error: string) => void;
  /** Auto play's pace multiplier: the table's deal speed. */
  speed?: number;
}

/**
 * Plays one round at a table through the engine (on the server, for a
 * member), or a few under auto play: deals (or picks up a hand left mid-way),
 * shows what comes back, sends each decision, and settles each round on the
 * felt once it's been shown. False if the table was reset part-way through.
 */
export async function playTable<D, C>(t: TableRound<D, C>): Promise<boolean> {
  const live = tableProgress(player.truth, t.game).live;
  const auto = t.autoPlay() && !live;
  const req = { room: floor.current, ...t.request() };
  let reply: TableReply;
  if (auto) {
    const s = autoplay.settings;
    reply = await tableAct({
      type: 'table.auto',
      game: t.game,
      ...req,
      rounds: Math.min(AUTO_BATCH, s.stopAfter ? Math.max(1, s.stopRounds - autoplay.rounds) : AUTO_BATCH),
      stop: { winX: s.stopOnWin ? s.stopWinX : undefined, below: s.stopBelow ? s.stopBelowAmount : undefined, above: s.stopAbove ? s.stopAboveAmount : undefined },
    }, t.speed ?? 1);
  } else reply = await tableAct(live ? { type: 'table.resume', game: t.game } : { type: 'table.deal', game: t.game, ...req });
  if (!reply.ok) {
    t.failed(reply.error ?? 'The hand couldn’t be dealt.');
    return true;
  }
  const unit = new Decimal(live?.unit ?? req.bet);
  if (auto) {
    for (let i = 0; i < reply.plays.length; i++) {
      const play = reply.plays[i]!;
      if (i > 0 && !(await t.wait(t.between))) return false;
      reply.begin(i);
      t.start(play, unit);
      t.ready?.(play, unit);
      if (!(await t.show(play.events, play))) return false;
      t.settled(play, reply.holds[i] ?? null, unit);
    }
    return true;
  }
  let play = reply.plays[0];
  if (!play) return true;
  t.start(play, unit);
  let fresh = true;
  for (;;) {
    if (play.settled) t.ready?.(play, unit);
    if (fresh && !(await t.show(play.events, play))) return false;
    fresh = true;
    if (play.settled) {
      t.settled(play, reply.holds[0] ?? null, unit);
      return true;
    }
    const choice = await t.decide(play.decision as D, unit);
    if (choice === null) return false;
    const next = await tableAct({ type: 'table.move', game: t.game, choice });
    if (!next.ok) {
      // Not taken, or no answer: the same decision is asked again.
      t.failed(next.error ?? 'That move didn’t go through.');
      fresh = false;
      continue;
    }
    reply = next;
    play = next.plays[0]!;
  }
}

/** Rounds auto play asks a table for at once. */
const AUTO_BATCH = 5;
