import { CATEGORY_NAMES, type Category } from '@idlesuits/sim';
import { margin95, runSlices } from './parallel';
import { emptyStudSums, mergeStud, runStudBatch, type StudSums } from './stud';

export function studSlice(start: number, count: number, seed: string): StudSums {
  return runStudBatch({ runSeed: seed, hands: count, startRound: start });
}

/** Mississippi Stud swings ~9 antes a round (a royal pays 500 on ten units), so runs need to be long. */
export async function runStudCli(hands: number, seed: string, workers: number) {
  const started = performance.now();
  const sums =
    workers > 1
      ? (await runSlices<StudSums>('stud', hands, seed, workers)).reduce(mergeStud, emptyStudSums())
      : studSlice(0, hands, seed);
  const seconds = (performance.now() - started) / 1000;

  const n = sums.rounds;
  const { mean, sd, margin } = margin95(sums.net, sums.sq, n);
  const pct = (x: number) => `${(x * 100).toFixed(3)}%`;

  console.log(`Game: Mississippi Stud | Seed: ${seed}`);
  console.log(`Rounds: ${n.toLocaleString()} in ${seconds.toFixed(1)}s on ${workers} process${workers > 1 ? 'es' : ''}`);
  console.log(`\n  House edge per ante   ${pct(-mean)} ±${pct(margin)}   (published 4.91%)`);
  console.log(`  Element of risk       ${pct(-sums.net / sums.wagered)}   (published 1.37%)`);
  console.log(`  Average wager         ${(sums.wagered / n).toFixed(3)} antes   (published 3.59)`);
  console.log(`  Spread per round      ${sd.toFixed(2)} antes`);
  console.log('\nFolded on');
  for (const [street, count] of Object.entries(sums.folds)) console.log(`  ${street}${street === '3' ? 'rd' : 'th'} street      ${pct(count / n)}`);
  console.log('\nFinal hands (played to the end)');
  for (const [category, count] of Object.entries(sums.categories).sort(([a], [b]) => Number(b) - Number(a))) {
    console.log(`  ${CATEGORY_NAMES[Number(category) as Category].padEnd(18)} ${pct(count / n)}`);
  }
}
