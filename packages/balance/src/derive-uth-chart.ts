import { rankLabel, RANKS, SUITS, standardDeck, simulateUthRound, decideUth, startingHandKey, type Card } from '@idlesuits/sim';
import { writeFileSync } from 'node:fs';

/**
 * Derives the Ultimate Texas Hold'em pre-flop chart and writes
 * packages/sim/src/uth/chart.ts. For each of the 169 starting hands it plays
 * the same deals both ways — raise 4x, or check and play on — and keeps
 * whichever wins more. Close calls get a second, longer pass, and the result
 * is made monotone in the side card.
 *
 *   npm run derive:uth-chart -- 1200
 */
const deck = standardDeck('player');
const SAMPLES = Number(process.argv[2] ?? 3000);
const empty = { chart: {} };

function holeFor(highRank: number, lowRank: number, suited: boolean): Card[] {
  const a = deck.find((c) => c.rank === highRank && c.suit === SUITS[0])!;
  const b = deck.find((c) => c.rank === lowRank && c.suit === (suited ? SUITS[0] : SUITS[1]))!;
  return [a, b];
}

const chart: Record<string, boolean> = {};
const margins = new Map<string, number>();
const holes = new Map<string, Card[]>();
const started = Date.now();

function measure(hole: Card[], key: string, samples: number): number {
  let raiseEv = 0;
  let checkEv = 0;
  for (let round = 0; round < samples; round++) {
    const seed = { run: `chart-${key}`, round };
    raiseEv += simulateUthRound({
      seed,
      hole,
      decide: (d) => (d.street === 'preflop' ? { move: 'raise', raise: 4 } : decideUth(empty, d, deck)),
    }).net;
    checkEv += simulateUthRound({
      seed,
      hole,
      decide: (d) => (d.street === 'preflop' ? { move: 'check' } : decideUth(empty, d, deck)),
    }).net;
  }
  return (raiseEv - checkEv) / samples;
}

for (const high of [...RANKS].reverse()) {
  for (const low of [...RANKS].reverse()) {
    if (low > high) continue;
    for (const suited of high === low ? [false] : [true, false]) {
      const hole = holeFor(high, low, suited);
      const key = startingHandKey(hole);
      holes.set(key, hole);
      const margin = measure(hole, key, SAMPLES);
      chart[key] = margin > 0;
      margins.set(key, margin);
    }
  }
}

// Second pass: the close calls get far more samples, since those are the cells
// a short run gets wrong.
const close = [...margins].filter(([, m]) => Math.abs(m) < 0.2).map(([k]) => k);
console.log(`pass 1 done in ${((Date.now() - started) / 1000).toFixed(0)}s; refining ${close.length} close calls`);
for (const key of close) {
  const margin = measure(holes.get(key)!, `refine-${key}`, SAMPLES * 12);
  chart[key] = margin > 0;
  margins.set(key, margin);
}

// Raising is monotone: if a holding is worth 4x, so is the same hand with a
// higher side card. This irons out whatever noise is left.
for (const high of RANKS) {
  for (const suited of [true, false]) {
    let raise = false;
    for (const low of RANKS) {
      if (low > high) continue;
      const key = high === low ? `${rankLabel(high)}${rankLabel(high)}` : `${rankLabel(high)}${rankLabel(low)}${suited ? 's' : 'o'}`;
      if (high === low && suited) continue;
      if (chart[key]) raise = true;
      else if (raise) chart[key] = true;
    }
  }
}

const raised = Object.values(chart).filter(Boolean).length;
console.log(`${Object.keys(chart).length} starting hands, raise 4x with ${raised}, in ${((Date.now() - started) / 1000).toFixed(0)}s`);
console.log('closest calls:', [...margins].sort((a, b) => Math.abs(a[1]) - Math.abs(b[1])).slice(0, 8).map(([k, m]) => `${k} ${m.toFixed(3)}`).join('  '));

const rows = [...RANKS].reverse();
console.log('\n    ' + rows.map((r) => rankLabel(r).padStart(3)).join(''));
for (const high of rows) {
  const cells = rows.map((low) => {
    const key = high === low ? `${rankLabel(high)}${rankLabel(high)}` : high > low ? `${rankLabel(high)}${rankLabel(low)}s` : `${rankLabel(low)}${rankLabel(high)}o`;
    return (chart[key] ? '4x' : '·').padStart(3);
  });
  console.log(rankLabel(high).padStart(3) + ' ' + cells.join(''));
}

const entries = Object.entries(chart).filter(([, raise]) => raise).map(([key]) => key).sort();
writeFileSync(
  'packages/sim/src/uth/chart.ts',
  `import type { PreflopChart } from './strategy';\n\n/**\n * Starting hands worth the big pre-flop raise, derived by simulating each of\n * the 169 holdings both ways against the same deals (see packages/balance/src/derive-uth-chart.ts).\n */\nconst RAISE_4X = ${JSON.stringify(entries, null, 2).replace(/"/g, "'").replace(/'/g, "'")} as const;\n\nexport const PREFLOP_CHART: PreflopChart = Object.fromEntries(RAISE_4X.map((hand) => [hand, true]));\n`,
);
console.log('\nwrote packages/sim/src/uth/chart.ts');
