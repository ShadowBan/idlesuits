/** One line of a side bet's pay table. */
export interface BonusRow {
  label: string;
  /** N in "pays N to 1". */
  pays: number;
}

/**
 * An optional side bet that pays on the cards alone, win or lose, whatever
 * the player does with the main bet. `Ctx` is whatever the game knows once
 * the deal is complete.
 */
export interface BonusBet<Ctx> {
  id: string;
  name: string;
  /** For a betting spot on the felt. */
  short: string;
  /** What it pays on, in a few words. */
  blurb: string;
  /** Best first. */
  rows: readonly BonusRow[];
  /** House edge of this pay table as published; the audit holds the simulator to it. */
  edge: number;
  /** Quoted "for one": a win returns `pays + 1`, stake included, so `pays` is still the net. */
  forOne?: boolean;
  /** The winning row's index, or -1 when the bet loses. */
  resolve: (ctx: Ctx) => number;
}

export interface BonusResult {
  id: string;
  /** Index into the bet's rows, or -1 for a loss. */
  row: number;
  /** In the same units as the stake. */
  net: number;
}

/** Settles every bet with a stake above zero; unstaked bets are left out. */
export function settleBonuses<Ctx>(
  bets: readonly BonusBet<Ctx>[],
  stakes: Readonly<Record<string, number>> | undefined,
  ctx: Ctx,
): BonusResult[] {
  const results: BonusResult[] = [];
  for (const bet of bets) {
    const stake = stakes?.[bet.id] ?? 0;
    if (stake <= 0) continue;
    const row = bet.resolve(ctx);
    results.push({ id: bet.id, row, net: row < 0 ? -stake : bet.rows[row]!.pays * stake });
  }
  return results;
}

/** True if any bet in the list has a stake above zero. */
export function anyStaked(stakes: Readonly<Record<string, number>> | undefined): boolean {
  return Object.values(stakes ?? {}).some((s) => s > 0);
}
