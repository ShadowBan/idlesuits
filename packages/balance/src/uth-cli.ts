import { runSlices } from './parallel';
import { runUthBatch, uthEdgePerAnte, type UthStats } from './uth';

/**
 * A hand of Ultimate Texas Hold'em swings about 4.2 antes, so pinning the edge
 * to ±0.3% takes roughly ten million rounds. With `workers` above one the run
 * is split into slices, each in its own process, and the sums combined.
 */
export async function runUthCli(hands: number, seed: string, workers: number) {
  const started = performance.now();
  const stats = workers > 1 ? await runParallel(hands, seed, workers) : sliceSums(0, hands, seed);
  const seconds = (performance.now() - started) / 1000;

  const n = stats.rounds;
  const mean = stats.net / n;
  const sd = Math.sqrt(stats.sq / n - mean * mean);
  const pct = (x: number) => `${(x * 100).toFixed(3)}%`;

  console.log(`Game: Ultimate Texas Hold'em | Seed: ${seed}`);
  console.log(`Rounds: ${n.toLocaleString()} in ${seconds.toFixed(1)}s on ${workers} process${workers > 1 ? 'es' : ''}`);
  console.log(`\n  House edge per ante   ${pct(-mean)} ±${pct((1.96 * sd) / Math.sqrt(n))}   (published 2.43% for this strategy)`);
  console.log(`  Element of risk       ${pct(-stats.net / stats.wagered)}   (published ~0.58%)`);
  console.log(`  Average wager         ${(stats.wagered / n).toFixed(3)} antes`);
  console.log(`  Spread per round      ${sd.toFixed(2)} antes`);
  console.log('\nPlay bet');
  for (const [size, count] of Object.entries(stats.raises).sort(([a], [b]) => Number(b) - Number(a))) {
    console.log(`  ${size === '0' ? 'fold' : `${size}x`.padEnd(4)}  ${pct(count / n)}`);
  }
  console.log(`\nPer round: ante ${(stats.parts.ante / n).toFixed(4)} · play ${(stats.parts.play / n).toFixed(4)} · blind ${(stats.parts.blind / n).toFixed(4)}`);
}

interface Sums extends UthStats {
  sq: number;
}

/** Runs rounds [start, start + count) and keeps the sum of squares for the margin. */
export function sliceSums(start: number, count: number, seed: string): Sums {
  const sums = { ...runUthBatch({ runSeed: seed, hands: 0 }), sq: 0 };
  for (let round = start; round < start + count; round++) {
    const before = sums.net;
    runUthBatch({ runSeed: seed, hands: 1, startRound: round }, sums);
    const net = sums.net - before;
    sums.sq += net * net;
  }
  return sums;
}

function merge(into: Sums, from: Sums): Sums {
  into.rounds += from.rounds;
  into.net += from.net;
  into.sq += from.sq;
  into.wagered += from.wagered;
  into.folds += from.folds;
  into.dealerQualified += from.dealerQualified;
  for (const key of ['ante', 'play', 'blind', 'bonus'] as const) into.parts[key] += from.parts[key];
  for (const [k, v] of Object.entries(from.raises)) into.raises[Number(k)] = (into.raises[Number(k)] ?? 0) + v;
  for (const [k, v] of Object.entries(from.categories)) into.categories[Number(k)] = (into.categories[Number(k)] ?? 0) + v;
  into.biggestWin = Math.max(into.biggestWin, from.biggestWin);
  into.biggestLoss = Math.min(into.biggestLoss, from.biggestLoss);
  return into;
}

async function runParallel(hands: number, seed: string, workers: number): Promise<Sums> {
  const results = await runSlices<Sums>('uth', hands, seed, workers);
  return results.reduce(merge, { ...runUthBatch({ runSeed: seed, hands: 0 }), sq: 0 });
}

export { uthEdgePerAnte };
