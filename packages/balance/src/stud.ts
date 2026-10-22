import { decideStud, simulateStudRound, STUD_RULES, type Seed, type StudRules } from '@idlesuits/sim';

export interface StudSums {
  rounds: number;
  net: number;
  sq: number;
  wagered: number;
  folds: Record<number, number>;
  categories: Record<number, number>;
  biggestWin: number;
}

export function emptyStudSums(): StudSums {
  return { rounds: 0, net: 0, sq: 0, wagered: 0, folds: {}, categories: {}, biggestWin: 0 };
}

export function runStudBatch(
  input: { runSeed: Seed; hands: number; startRound?: number; rules?: StudRules },
  sums: StudSums = emptyStudSums(),
): StudSums {
  const start = input.startRound ?? 0;
  for (let round = start; round < start + input.hands; round++) {
    const r = simulateStudRound({ rules: input.rules ?? STUD_RULES, seed: { run: input.runSeed, round }, decide: decideStud });
    sums.rounds++;
    sums.net += r.net;
    sums.sq += r.net * r.net;
    sums.wagered += r.wagered;
    if (r.folded) {
      const street = 3 + r.bets.length;
      sums.folds[street] = (sums.folds[street] ?? 0) + 1;
    } else if (r.hand) {
      sums.categories[r.hand.category] = (sums.categories[r.hand.category] ?? 0) + 1;
    }
    sums.biggestWin = Math.max(sums.biggestWin, r.net);
  }
  return sums;
}

export function mergeStud(into: StudSums, from: StudSums): StudSums {
  into.rounds += from.rounds;
  into.net += from.net;
  into.sq += from.sq;
  into.wagered += from.wagered;
  for (const [k, v] of Object.entries(from.folds)) into.folds[Number(k)] = (into.folds[Number(k)] ?? 0) + v;
  for (const [k, v] of Object.entries(from.categories)) into.categories[Number(k)] = (into.categories[Number(k)] ?? 0) + v;
  into.biggestWin = Math.max(into.biggestWin, from.biggestWin);
  return into;
}
