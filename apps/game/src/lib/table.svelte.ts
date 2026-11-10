import type { Action, TablePlay, TableSettled } from '@idlesuits/engine';
import { autoplay } from './autoplay.svelte';
import { meta } from './meta.svelte';
import { Decimal } from './money';
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
export async function tableAct(action: Action): Promise<TableReply> {
  const before = player.shown.floor.best;
  let holds: (number | null)[] = [];
  const held = (p: TablePlay) =>
    p.settled ? { game: p.settled.game, bet: p.settled.unit, net: 0, onHouse: true, tokens: p.settled.tokens, money: p.settled.money, staked: p.settled.staked, after: p.settled.after } : null;
  const out = await player.act(action, (landed) => {
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
