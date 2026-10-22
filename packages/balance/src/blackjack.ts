import {
  FREE_BET_RULES,
  simulateBjRound,
  solveStrategy,
  type BjRules,
  type HandOutcome,
  type Seed,
  type StrategyTables,
} from '@idlesuits/sim';

export interface BjBatchInput {
  tables: StrategyTables;
  rules?: BjRules;
  runSeed: Seed;
  hands: number;
  startRound?: number;
}

export interface BjStats {
  rounds: number;
  /** Hands played, counting each split hand. */
  hands: number;
  /** Total result in units of the base bet. */
  net: number;
  outcomes: Record<HandOutcome, number>;
  /** Rounds containing at least one of these. */
  freeDoubles: number;
  freeSplits: number;
  /** Units won by the house's free bets. */
  freeWon: number;
  biggestWin: number;
  biggestLoss: number;
}

export function emptyBjStats(): BjStats {
  return {
    rounds: 0,
    hands: 0,
    net: 0,
    outcomes: { blackjack: 0, win: 0, lose: 0, push: 0, push22: 0, bust: 0, dealerBlackjack: 0 },
    freeDoubles: 0,
    freeSplits: 0,
    freeWon: 0,
    biggestWin: 0,
    biggestLoss: 0,
  };
}

export function runBjBatch(input: BjBatchInput, stats: BjStats = emptyBjStats()): BjStats {
  const start = input.startRound ?? 0;
  for (let round = start; round < start + input.hands; round++) {
    const result = simulateBjRound({
      rules: input.rules,
      tables: input.tables,
      seed: { run: input.runSeed, round },
    });
    stats.rounds++;
    stats.net += result.net;
    stats.biggestWin = Math.max(stats.biggestWin, result.net);
    stats.biggestLoss = Math.min(stats.biggestLoss, result.net);
    if (result.hands.length > 1) stats.freeSplits++;
    for (const hand of result.hands) {
      stats.hands++;
      if (hand.outcome) stats.outcomes[hand.outcome]++;
      if (hand.free > 0 && !hand.fromSplit) stats.freeDoubles++;
      if (hand.free > 0 && (hand.net ?? 0) > 0) stats.freeWon += hand.free;
    }
  }
  return stats;
}

/** Expected result per unit of the player's own bet; negative is the house edge. */
export function bjEdge(stats: BjStats): number {
  return stats.net / stats.rounds;
}

export function defaultTables(rules: BjRules = FREE_BET_RULES): StrategyTables {
  return solveStrategy(rules);
}
