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
}

/**
 * Sends a table action to the engine (the server, for a member). A round it
 * settles has its money held off the screen until the table has shown it:
 * call `landSettled` then.
 */
export async function tableAct(action: Action): Promise<TableReply> {
  const before = player.shown.floor.best;
  let holds: (number | null)[] = [];
  const out = await player.act(action, (landed) => {
    const plays = landed.result && 'plays' in landed.result ? landed.result.plays : [];
    holds = plays.map((p) =>
      p.settled
        ? player.holdBack([{ game: p.settled.game, bet: p.settled.unit, net: 0, onHouse: true, tokens: p.settled.tokens, money: p.settled.money, after: p.settled.after }], before)[0]!
        : null,
    );
  });
  if (!out.ok) return { ok: false, error: out.error, plays: [], holds: [] };
  const plays = out.result && 'plays' in out.result ? out.result.plays : [];
  return { ok: true, plays, holds };
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
