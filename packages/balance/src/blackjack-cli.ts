import { FREE_BET_RULES, solveStrategy, type Seed } from '@idlesuits/sim';
import { bjEdge, runBjBatch } from './blackjack';

/** Simulates Free Bet Blackjack and prints how the table runs. */
export async function runBlackjack(hands: number, seed: Seed) {
  const tables = solveStrategy(FREE_BET_RULES);
  const started = performance.now();
  const stats = runBjBatch({ tables, runSeed: seed, hands });
  const seconds = (performance.now() - started) / 1000;

  const pct = (n: number, of = stats.hands) => `${((n / of) * 100).toFixed(2)}%`;
  const pad = (s: string, n: number) => s.padEnd(n);

  console.log(`Game: Free Bet Blackjack | ${FREE_BET_RULES.decks} decks | Seed: ${seed}`);
  console.log(`Rounds: ${hands.toLocaleString()} in ${seconds.toFixed(2)}s (${Math.round(hands / seconds).toLocaleString()}/s)`);
  // A round swings about 1.15 bets, so short runs are noisy; show the margin.
  const margin = (1.96 * 1.15 * 100) / Math.sqrt(stats.rounds);
  console.log(`\n  ${pad('House edge', 22)} ${(-bjEdge(stats) * 100).toFixed(3)}% ±${margin.toFixed(3)}   (published 1.04%)`);
  console.log(`  ${pad('Hands per round', 22)} ${(stats.hands / stats.rounds).toFixed(3)}`);
  console.log(`  ${pad('Rounds with a split', 22)} ${pct(stats.freeSplits, stats.rounds)}`);
  console.log(`  ${pad('Hands doubled free', 22)} ${pct(stats.freeDoubles)}`);
  console.log(`  ${pad('Won on house money', 22)} ${(stats.freeWon / stats.rounds).toFixed(4)} per round`);

  console.log('\nOutcomes');
  for (const [outcome, count] of Object.entries(stats.outcomes)) {
    console.log(`  ${pad(outcome, 22)} ${pct(count)}`);
  }
  console.log(`\nNet: ${stats.net.toFixed(0)} bets | biggest win ${stats.biggestWin} | biggest loss ${stats.biggestLoss}`);
}
