import type { BonusBet, BonusResult } from '@idlesuits/sim';
import type { BreakdownLine } from './breakdown';
import { Decimal } from './money';

/** Any game's side bet: the table only needs its name and pay table, never its context. */
export type AnyBonus = BonusBet<never>;

/**
 * What the player has riding on each side bet, in dollars, for the next hand.
 * Every bet starts off; chips set on its spot turn it on.
 */
export class SideStakes<Bet extends { id: string } = AnyBonus> {
  stakes = $state<Record<string, Decimal>>({});

  constructor(readonly bets: readonly Bet[]) {
    this.reset();
  }

  amount(id: string): Decimal {
    return this.stakes[id] ?? new Decimal(0);
  }


  /** Puts more on one bet, as chips set on its spot. */
  add(id: string, amount: Decimal) {
    this.stakes = { ...this.stakes, [id]: this.amount(id).add(amount) };
  }

  /** Takes every chip off one bet. */
  clear(id: string) {
    this.stakes = { ...this.stakes, [id]: new Decimal(0) };
  }

  /** Doubles every side bet that is up. */
  double() {
    this.stakes = Object.fromEntries(Object.entries(this.stakes).map(([id, s]) => [id, s.mul(2)]));
  }

  /** Stakes in units of `ante`, for the simulator. Bets that are off are left out. */
  units(ante: Decimal): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [id, stake] of Object.entries(this.stakes)) if (stake.gt(0)) out[id] = stake.div(ante).toNumber();
    return out;
  }

  get total(): Decimal {
    return Object.values(this.stakes).reduce((sum, s) => sum.add(s), new Decimal(0));
  }

  reset() {
    this.stakes = Object.fromEntries(this.bets.map((b) => [b.id, new Decimal(0)]));
  }
}

/** A breakdown line for a settled side bet: "Trips · Flush pays 7:1". */
export function bonusLine(bets: readonly AnyBonus[], result: BonusResult): BreakdownLine {
  const bet = bets.find((b) => b.id === result.id)!;
  const row = result.row >= 0 ? bet.rows[result.row]! : null;
  let pays = 'miss';
  if (row && !bet.forOne) pays = `${row.label} pays ${row.pays}:1`;
  else if (row) pays = row.pays === 0 ? `${row.label}, push` : `${row.label} pays ${row.pays + 1} for 1`;
  return { label: `${bet.name} · ${pays}`, amount: result.net };
}

export function formatEdge(edge: number): string {
  return `${(edge * 100).toFixed(2)}%`;
}
