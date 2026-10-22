import {
  decideUth,
  PREFLOP_CHART,
  simulateUthRound,
  standardDeck,
  UTH_RULES,
  type Seed,
  type UthRules,
  type UthStrategy,
} from '@idlesuits/sim';

export interface UthBatchInput {
  rules?: UthRules;
  strategy?: UthStrategy;
  /** Trips side bet, in antes. */
  trips?: number;
  runSeed: Seed;
  hands: number;
  startRound?: number;
}

export interface UthStats {
  rounds: number;
  net: number;
  /** Ante plus blind plus play plus trips, totalled over the run. */
  wagered: number;
  parts: { ante: number; play: number; blind: number; trips: number };
  raises: Record<number, number>;
  folds: number;
  dealerQualified: number;
  categories: Record<number, number>;
  biggestWin: number;
  biggestLoss: number;
}

export function emptyUthStats(): UthStats {
  return {
    rounds: 0,
    net: 0,
    wagered: 0,
    parts: { ante: 0, play: 0, blind: 0, trips: 0 },
    raises: {},
    folds: 0,
    dealerQualified: 0,
    categories: {},
    biggestWin: 0,
    biggestLoss: 0,
  };
}

export const DEFAULT_UTH_STRATEGY: UthStrategy = { chart: PREFLOP_CHART };

export function runUthBatch(input: UthBatchInput, stats: UthStats = emptyUthStats()): UthStats {
  const deck = standardDeck('player');
  const strategy = input.strategy ?? DEFAULT_UTH_STRATEGY;
  const trips = input.trips ?? 0;
  const start = input.startRound ?? 0;

  for (let round = start; round < start + input.hands; round++) {
    const result = simulateUthRound({
      rules: input.rules,
      seed: { run: input.runSeed, round },
      trips,
      decide: (decision) => decideUth(strategy, decision, deck),
    });

    stats.rounds++;
    stats.net += result.net;
    // Ante and blind are always up; the play bet only when it is made.
    stats.wagered += 2 + result.play + trips;
    for (const key of ['ante', 'play', 'blind', 'trips'] as const) stats.parts[key] += result.parts[key];
    stats.raises[result.play] = (stats.raises[result.play] ?? 0) + 1;
    if (result.folded) stats.folds++;
    if (result.dealerQualified) stats.dealerQualified++;
    stats.categories[result.playerHand.category] = (stats.categories[result.playerHand.category] ?? 0) + 1;
    stats.biggestWin = Math.max(stats.biggestWin, result.net);
    stats.biggestLoss = Math.min(stats.biggestLoss, result.net);
  }
  return stats;
}

/** Expected loss per ante; the figure casinos quote for this game. */
export function uthEdgePerAnte(stats: UthStats): number {
  return stats.net / stats.rounds;
}

/** Expected loss per unit actually wagered. */
export function uthElementOfRisk(stats: UthStats): number {
  return stats.net / stats.wagered;
}
