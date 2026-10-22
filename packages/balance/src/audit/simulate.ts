import {
  buildShoe,
  decideStud,
  decideUth,
  DEFAULT_RULES,
  FREE_BET_RULES,
  OPTIMAL_BASE_POLICY,
  PREFLOP_CHART,
  simulateBjRound,
  simulateRound,
  simulateStudRound,
  simulateUthRound,
  solveStrategy,
  standardDeck,
  STUD_BONUSES,
  UTH_BONUSES,
} from '@idlesuits/sim';

/**
 * Long runs through the real round engines, with every side bet up at one
 * unit, so the whole path from deal to settlement is what gets measured.
 * Each returns plain sums for one slice of rounds; slices add together.
 */

/** Sum, sum of squares and count of one bet's result per round. */
export interface Acc {
  n: number;
  sum: number;
  sq: number;
}

export type SimSums = Record<string, Acc | number>;

function acc(sums: SimSums, key: string, x: number) {
  const a = (sums[key] ??= { n: 0, sum: 0, sq: 0 }) as Acc;
  a.n++;
  a.sum += x;
  a.sq += x * x;
}

function count(sums: SimSums, key: string, n = 1) {
  sums[key] = ((sums[key] as number | undefined) ?? 0) + n;
}

export function mergeSums(parts: SimSums[]): SimSums {
  const total: SimSums = {};
  for (const part of parts) {
    for (const [key, value] of Object.entries(part)) {
      if (typeof value === 'number') count(total, key, value);
      else {
        const a = (total[key] ??= { n: 0, sum: 0, sq: 0 }) as Acc;
        a.n += value.n;
        a.sum += value.sum;
        a.sq += value.sq;
      }
    }
  }
  return total;
}

const SUITS_SHOE = buildShoe(standardDeck('player'));

export function simSuits(seed: string, start: number, rounds: number): SimSums {
  const sums: SimSums = {};
  const sideBets = Object.fromEntries(DEFAULT_RULES.sideBets.map((b) => [b.id, 1]));
  for (let round = start; round < start + rounds; round++) {
    const result = simulateRound({
      shoe: SUITS_SHOE,
      seats: [{ raisePolicy: OPTIMAL_BASE_POLICY, sideBets }],
      rules: DEFAULT_RULES,
      seed: { run: seed, dealerId: 'standard', round },
    });
    const seat = result.seats[0]!;
    acc(sums, 'main', seat.mainNet);
    count(sums, 'wagered', 1 + seat.raise);
    if (seat.outcome === 'fold') count(sums, 'folds');
    for (const [id, bet] of Object.entries(seat.sideBets)) acc(sums, id, bet.net);
  }
  return sums;
}

const BJ_TABLES = solveStrategy(FREE_BET_RULES);

export function simBlackjack(seed: string, start: number, rounds: number): SimSums {
  const sums: SimSums = {};
  for (let round = start; round < start + rounds; round++) {
    const r = simulateBjRound({
      tables: BJ_TABLES,
      seed: { run: seed, round },
      bonuses: { potOfGold: 1, push22: 1 },
    });
    let side = 0;
    for (const bonus of r.bonuses) {
      acc(sums, bonus.id, bonus.net);
      side += bonus.net;
    }
    // Side bets never change the main game, so it is what is left over.
    acc(sums, 'main', r.net - side);
    count(sums, `freeBets:${r.freeBets}`);
    if (!r.dealerBlackjack && r.dealerTotal.total === 22) count(sums, 'dealer22');
  }
  return sums;
}

const DECK = standardDeck('player');
const UTH_STRATEGY = { chart: PREFLOP_CHART };
const UTH_ALL = Object.fromEntries(UTH_BONUSES.map((b) => [b.id, 1]));

export function simUth(seed: string, start: number, rounds: number): SimSums {
  const sums: SimSums = {};
  for (let round = start; round < start + rounds; round++) {
    const r = simulateUthRound({
      seed: { run: seed, round },
      bonuses: UTH_ALL,
      decide: (decision) => decideUth(UTH_STRATEGY, decision, DECK),
    });
    for (const bonus of r.bonuses) acc(sums, bonus.id, bonus.net);
    acc(sums, 'main', r.net - r.parts.bonus);
    count(sums, 'wagered', 2 + r.play);
    if (r.folded) count(sums, 'folds');
  }
  return sums;
}

const STUD_ALL = Object.fromEntries(STUD_BONUSES.map((b) => [b.id, 1]));

export function simStud(seed: string, start: number, rounds: number): SimSums {
  const sums: SimSums = {};
  for (let round = start; round < start + rounds; round++) {
    const r = simulateStudRound({ seed: { run: seed, round }, decide: decideStud, bonuses: STUD_ALL });
    let side = 0;
    for (const bonus of r.bonuses) {
      acc(sums, bonus.id, bonus.net);
      side += bonus.net;
    }
    acc(sums, 'main', r.net - side);
    count(sums, 'wagered', r.wagered);
  }
  return sums;
}

export const SIMULATIONS = { suits: simSuits, blackjack: simBlackjack, uth: simUth, stud: simStud } as const;
export type SimGame = keyof typeof SIMULATIONS;
