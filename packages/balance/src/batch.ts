import { simulateRound, type Card, type MainOutcome, type Seed, type SeatConfig, type TableRules } from '@idlesuits/sim';

export interface BatchInput {
  shoe: readonly Card[];
  seat: SeatConfig;
  rules: TableRules;
  runSeed: Seed;
  dealerId: string;
  hands: number;
  startRound?: number;
}

export interface SideBetStats {
  owner: 'player' | 'dealer';
  staked: number;
  net: number;
  hits: number;
}

export interface BatchStats {
  hands: number;
  mainNet: number;
  /** Total ante + raise put at risk. */
  mainWagered: number;
  outcomes: Record<MainOutcome, number>;
  playerFlush: Record<number, number>;
  dealerFlush: Record<number, number>;
  dealerQualified: number;
  sideBets: Record<string, SideBetStats>;
  net: number;
  biggestWin: number;
  biggestLoss: number;
}

export function emptyStats(): BatchStats {
  return {
    hands: 0,
    mainNet: 0,
    mainWagered: 0,
    outcomes: { fold: 0, win: 0, lose: 0, push: 0, dealerNoQualify: 0 },
    playerFlush: {},
    dealerFlush: {},
    dealerQualified: 0,
    sideBets: {},
    net: 0,
    biggestWin: 0,
    biggestLoss: 0,
  };
}

export function runBatch(input: BatchInput, stats: BatchStats = emptyStats()): BatchStats {
  const start = input.startRound ?? 0;
  for (let round = start; round < start + input.hands; round++) {
    const result = simulateRound({
      shoe: input.shoe,
      seats: [input.seat],
      rules: input.rules,
      seed: { run: input.runSeed, dealerId: input.dealerId, round },
    });
    const seat = result.seats[0]!;

    stats.hands++;
    stats.mainNet += seat.mainNet;
    stats.mainWagered += 1 + seat.raise;
    stats.outcomes[seat.outcome]++;
    stats.playerFlush[seat.hand.size] = (stats.playerFlush[seat.hand.size] ?? 0) + 1;
    stats.dealerFlush[result.dealerHand.size] = (stats.dealerFlush[result.dealerHand.size] ?? 0) + 1;
    if (result.dealerQualified) stats.dealerQualified++;
    stats.net += seat.net;
    stats.biggestWin = Math.max(stats.biggestWin, seat.net);
    stats.biggestLoss = Math.min(stats.biggestLoss, seat.net);

    for (const [id, bet] of Object.entries(seat.sideBets)) {
      if (bet.owner === 'none') continue;
      const s = (stats.sideBets[id] ??= { owner: bet.owner, staked: 0, net: 0, hits: 0 });
      s.staked += bet.stake;
      s.net += bet.net;
      if (bet.pays > 0) s.hits++;
    }
  }
  return stats;
}

/** Expected value per ante for the main game. */
export function mainEdge(stats: BatchStats): number {
  return stats.mainNet / stats.hands;
}

/** Expected value per unit actually wagered (ante + raise). */
export function elementOfRisk(stats: BatchStats): number {
  return stats.mainNet / stats.mainWagered;
}

/** Expected value per unit staked on a side bet. */
export function sideBetEdge(bet: SideBetStats): number {
  return bet.net / bet.staked;
}
