import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  BJ_POT_OF_GOLD,
  BJ_PUSH_22,
  FLUSH_RUSH,
  lookupScale,
  STUD_THREE_CARD,
  SUPER_FLUSH_RUSH,
  UTH_BAD_BEAT,
  UTH_HOLE_CARD,
  UTH_SIX_CARD,
  UTH_TRIPS,
  type BonusBet,
  type SideBetDef,
} from '@idlesuits/sim';
import { chanceOfFreeBet } from './audit/blackjack-exact';
import {
  holeCardCounts,
  mergeCounts,
  sixCardCounts,
  studMainTotals,
  suitsCounts,
  threeCardCounts,
  tripsCounts,
  type Counts,
} from './audit/exact';
import { PUBLISHED, type Reference } from './audit/published';
import { mergeSums, SIMULATIONS, type Acc, type SimGame, type SimSums } from './audit/simulate';

/**
 * Checks the odds of every game and every side bet against published figures.
 *
 *   npm run audit                 full run, every core (a few minutes)
 *   npm run audit -- --quick      a tenth of the rounds, for a smoke test
 *   npm run audit -- --out docs/odds_audit.md
 *
 * Pay tables that can be dealt out exhaustively are checked exactly, through
 * the simulator's own evaluators and side-bet rules. Everything else is
 * simulated through the real round engines, and judged against its 95% margin.
 */

const EXACT_JOBS = {
  trips: tripsCounts,
  sixCard: sixCardCounts,
  studMain: studMainTotals,
} as const;

const ROUNDS: Record<SimGame, number> = { suits: 8e6, blackjack: 40e6, uth: 8e6, stud: 40e6 };

const { values } = parseArgs({
  options: {
    quick: { type: 'boolean', default: false },
    workers: { type: 'string', default: String(cpus().length) },
    seed: { type: 'string', default: 'audit' },
    out: { type: 'string' },
    // Internal: run one part of one job and print its result as JSON.
    job: { type: 'string' },
    part: { type: 'string' },
    parts: { type: 'string' },
    rounds: { type: 'string' },
  },
});

if (values.job) {
  const part = Number(values.part);
  const parts = Number(values.parts);
  if (values.job in EXACT_JOBS) {
    console.log(JSON.stringify(EXACT_JOBS[values.job as keyof typeof EXACT_JOBS](part, parts)));
  } else {
    const game = values.job.replace('sim:', '') as SimGame;
    const rounds = Number(values.rounds);
    const per = Math.ceil(rounds / parts);
    const start = part * per;
    console.log(JSON.stringify(SIMULATIONS[game](values.seed, start, Math.max(0, Math.min(per, rounds - start)))));
  }
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Running jobs across processes.

const self = fileURLToPath(import.meta.url);
const workers = Math.max(1, Number(values.workers));

function runPart<T>(job: string, part: number, parts: number, rounds = 0): Promise<T> {
  const args = ['tsx', self, '--job', job, '--part', String(part), '--parts', String(parts), '--seed', values.seed!];
  if (rounds) args.push('--rounds', String(rounds));
  return new Promise((resolve, reject) => {
    const child = spawn('npx', args);
    let text = '';
    child.stdout.on('data', (d) => (text += d));
    child.stderr.on('data', (d) => process.stderr.write(d));
    child.on('close', (code) => (code === 0 ? resolve(JSON.parse(text)) : reject(new Error(`${job} part ${part} exited ${code}`))));
  });
}

/** Runs tasks with at most `workers` processes at once. */
async function pool<T>(tasks: (() => Promise<T>)[]): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  let done = 0;
  const lane = async () => {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]!();
      done++;
      process.stderr.write(`\r  ${done}/${tasks.length} parts done`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(workers, tasks.length) }, lane));
  process.stderr.write('\n');
  return results;
}

// ---------------------------------------------------------------------------
// Judging.

/** `known`: disagrees with the source for a documented reason (see the row's note). */
type Verdict = 'pass' | 'close' | 'fail' | 'known' | 'info';

interface Row {
  game: string;
  bet: string;
  method: string;
  /** House edge as measured: positive means the house wins. */
  ours: number;
  /** 95% margin on `ours`, for simulated rows. */
  margin?: number;
  reference?: number;
  referenceLabel?: string;
  verdict: Verdict;
  detail?: string;
}

const rows: Row[] = [];

/** Exact against published: must agree to the published rounding, line counts and all. */
function exactRow(game: string, bet: string, ours: number, ref: Reference, counts?: Counts, extra?: string) {
  const diff = Math.abs(ours - ref.edge);
  let mismatched: string[] = [];
  if (ref.combos && counts) {
    mismatched = Object.entries(ref.combos)
      .filter(([line, n]) => (counts[line] ?? 0) !== n)
      .map(([line, n]) => `${line}: ${(counts[line] ?? 0).toLocaleString()} vs ${n.toLocaleString()}`);
  }
  const agrees = diff < 1e-5 && mismatched.length === 0;
  const verdict: Verdict = agrees ? 'pass' : ref.known ? 'known' : 'fail';
  const detail = [
    ref.combos && counts && mismatched.length === 0 ? 'every hand count matches' : '',
    mismatched.length ? `counts differ: ${mismatched.join('; ')}` : '',
    extra ?? '',
  ]
    .filter(Boolean)
    .join('. ');
  rows.push({ game, bet, method: 'exact', ours, reference: ref.edge, referenceLabel: ref.source, verdict, detail });
}

/** Simulated against a reference: inside the 95% margin passes, inside 99.9% is close. */
function simRow(
  game: string,
  bet: string,
  a: Acc,
  reference: number,
  referenceLabel: string,
  detail?: string,
  known = false,
) {
  const mean = a.sum / a.n;
  const sd = Math.sqrt(Math.max(0, a.sq / a.n - mean * mean));
  const se = sd / Math.sqrt(a.n);
  const ours = -mean;
  const z = Math.abs(ours - reference) / se;
  const verdict: Verdict = z <= 1.96 ? 'pass' : z <= 3.29 ? 'close' : known ? 'known' : 'fail';
  rows.push({ game, bet, method: `${fmtCount(a.n)} rounds`, ours, margin: 1.96 * se, reference, referenceLabel, verdict, detail });
}

function infoRow(game: string, bet: string, method: string, ours: string, detail: string) {
  rows.push({ game, bet, method, ours: NaN, verdict: 'info', detail: `${ours} — ${detail}` });
}

/** House edge from counts per pay-table line. */
function edgeOfBonus(bet: BonusBet<never>, counts: Counts): number {
  let ev = 0;
  let total = 0;
  for (const [line, n] of Object.entries(counts)) {
    total += n;
    ev += line === 'loses' ? -n : bet.rows.find((r) => r.label === line)!.pays * n;
  }
  return -ev / total;
}

function edgeOfScale(def: SideBetDef, counts: Counts): number {
  let ev = 0;
  let total = 0;
  for (const [metric, n] of Object.entries(counts)) {
    const pays = lookupScale(def.pays, Number(metric));
    ev += (pays > 0 ? pays : -1) * n;
    total += n;
  }
  return -ev / total;
}

const fmtCount = (n: number) =>
  n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}k` : String(n);
const pct = (x: number, digits = 3) => `${(x * 100).toFixed(digits)}%`;

// ---------------------------------------------------------------------------

const started = performance.now();
const scale = values.quick ? 0.1 : 1;
const sims = Object.keys(SIMULATIONS) as SimGame[];
const simRounds = Object.fromEntries(sims.map((g) => [g, Math.round(ROUNDS[g] * scale)])) as Record<SimGame, number>;

console.error(`Auditing with ${workers} processes${values.quick ? ' (quick)' : ''}…`);
const exactNames = Object.keys(EXACT_JOBS);
const tasks: (() => Promise<unknown>)[] = [];
for (const job of exactNames) for (let p = 0; p < workers; p++) tasks.push(() => runPart(job, p, workers));
for (const game of sims) for (let p = 0; p < workers; p++) tasks.push(() => runPart(`sim:${game}`, p, workers, simRounds[game]));
const results = await pool(tasks);

const exact: Record<string, Counts> = {};
exactNames.forEach((job, j) => (exact[job] = mergeCounts(results.slice(j * workers, (j + 1) * workers) as Counts[])));
const sim: Record<string, SimSums> = {};
sims.forEach((game, g) => {
  const from = (exactNames.length + g) * workers;
  sim[game] = mergeSums(results.slice(from, from + workers) as SimSums[]);
});
const acc = (game: SimGame, key: string) => sim[game]![key] as Acc;
const tally = (game: SimGame, key: string) => (sim[game]![key] as number | undefined) ?? 0;

// Idle Suits
const suits = suitsCounts();
const flushRushEdge = edgeOfScale(FLUSH_RUSH, suits.flushSize);
const superEdge = edgeOfScale(SUPER_FLUSH_RUSH, suits.straightFlush);
simRow('Idle Suits', 'Main game, per ante', acc('suits', 'main'), PUBLISHED.suitsMain.edge, PUBLISHED.suitsMain.source,
  `folds ${pct(tally('suits', 'folds') / acc('suits', 'main').n, 1)} (published 32.1%), ` +
  `average wager ${(tally('suits', 'wagered') / acc('suits', 'main').n).toFixed(3)} antes (published 1.711)`);
exactRow('Idle Suits', 'Flush Rush', flushRushEdge, PUBLISHED.flushRush, suits.flushSize);
exactRow('Idle Suits', 'Super Flush Rush', superEdge, PUBLISHED.superFlushRush, suits.straightFlush, PUBLISHED.superFlushRush.note);
simRow('Idle Suits', 'Flush Rush, dealt through the table', acc('suits', 'flushRush'), flushRushEdge, 'exact, above');
simRow('Idle Suits', 'Super Flush Rush, dealt through the table', acc('suits', 'superFlushRush'), superEdge, 'exact, above');

// Free Bet Blackjack
const bjRounds = acc('blackjack', 'main').n;
const freeBetExact = chanceOfFreeBet();
simRow('Free Bet Blackjack', 'Main game', acc('blackjack', 'main'), PUBLISHED.bjMain.edge, PUBLISHED.bjMain.source);
{
  const p = 1 - tally('blackjack', 'freeBets:0') / bjRounds;
  // A proportion's margin: treat each round as a 0/1 draw.
  const a: Acc = { n: bjRounds, sum: -p * bjRounds, sq: p * bjRounds };
  simRow('Free Bet Blackjack', 'Chance a round earns a free bet', a, freeBetExact, 'exact arithmetic on six decks',
    'a probability, not a house edge; it decides whether Pot of Gold wins');
}
simRow('Free Bet Blackjack', 'Pot of Gold', acc('blackjack', 'potOfGold'), PUBLISHED.potOfGold.edge, PUBLISHED.potOfGold.source,
  PUBLISHED.potOfGold.note + ' Odds for 0-7 free bets here: ' +
  [0, 1, 2, 3, 4, 5, 6, 7].map((k) => (tally('blackjack', `freeBets:${k}`) / bjRounds).toFixed(6)).join(' / '), true);
simRow('Free Bet Blackjack', 'Push 22', acc('blackjack', 'push22'), PUBLISHED.push22.edge, PUBLISHED.push22.source,
  `dealer made 22 in ${pct(tally('blackjack', 'dealer22') / bjRounds, 4)} of rounds (published 7.3536%)`);

// Ultimate Texas Hold'em
const uthRounds = acc('uth', 'main').n;
simRow("Ultimate Texas Hold'em", 'Main game, per ante', acc('uth', 'main'), PUBLISHED.uthMain.edge, PUBLISHED.uthMain.source,
  `average wager ${(tally('uth', 'wagered') / uthRounds).toFixed(3)} antes, folds ${pct(tally('uth', 'folds') / uthRounds, 1)}`);
const exactBonus: [string, BonusBet<never>, Counts, Reference][] = [
  ['Trips', UTH_TRIPS as BonusBet<never>, exact.trips!, PUBLISHED.trips],
  ['6-Card Bonus', UTH_SIX_CARD as BonusBet<never>, exact.sixCard!, PUBLISHED.sixCard],
  ['Hole Card Bonus', UTH_HOLE_CARD as BonusBet<never>, holeCardCounts(), PUBLISHED.holeCard],
];
for (const [name, bet, counts, ref] of exactBonus) {
  const edge = edgeOfBonus(bet, counts);
  exactRow("Ultimate Texas Hold'em", name, edge, ref, counts);
  simRow("Ultimate Texas Hold'em", `${name}, dealt through the table`, acc('uth', bet.id), edge, 'exact, above');
}
simRow("Ultimate Texas Hold'em", 'Bad Beat', acc('uth', UTH_BAD_BEAT.id), PUBLISHED.badBeat.edge, PUBLISHED.badBeat.source,
  'pays up to 7,500:1, so its margin stays wide');

// Mississippi Stud
const stud = exact.studMain!;
const studEdge = -stud.net! / stud.deals!;
exactRow('Mississippi Stud', 'Main game, per ante', studEdge, PUBLISHED.studMain, undefined,
  `all ${stud.deals!.toLocaleString()} deals; average wager ${(stud.wagered! / stud.deals!).toFixed(4)} antes, ` +
  `element of risk ${pct(-stud.net! / stud.wagered!)}`);
simRow('Mississippi Stud', 'Main game, dealt through the table', acc('stud', 'main'), studEdge, 'exact, above');
const threeCounts = threeCardCounts();
const threeEdge = edgeOfBonus(STUD_THREE_CARD as BonusBet<never>, threeCounts);
exactRow('Mississippi Stud', '3-Card Bonus', threeEdge, PUBLISHED.threeCard, threeCounts);
simRow('Mississippi Stud', '3-Card Bonus, dealt through the table', acc('stud', 'threeCard'), threeEdge, 'exact, above');

// Side bets show their house edge in the game; it must be the one measured here.
const shown: [string, number, number][] = [
  ['Flush Rush', FLUSH_RUSH.edge, flushRushEdge],
  ['Super Flush Rush', SUPER_FLUSH_RUSH.edge, superEdge],
  ['Trips', UTH_TRIPS.edge, edgeOfBonus(UTH_TRIPS as BonusBet<never>, exact.trips!)],
  ['6-Card Bonus', UTH_SIX_CARD.edge, edgeOfBonus(UTH_SIX_CARD as BonusBet<never>, exact.sixCard!)],
  ['Hole Card Bonus', UTH_HOLE_CARD.edge, edgeOfBonus(UTH_HOLE_CARD as BonusBet<never>, exactBonus[2]![2])],
  ['3-Card Bonus', STUD_THREE_CARD.edge, threeEdge],
];
const simShown: [string, number, Acc][] = [
  ['Pot of Gold', BJ_POT_OF_GOLD.edge, acc('blackjack', 'potOfGold')],
  ['Push 22', BJ_PUSH_22.edge, acc('blackjack', 'push22')],
  ['Bad Beat', UTH_BAD_BEAT.edge, acc('uth', 'badBeat')],
];
const label: string[] = [];
for (const [name, claimed, measured] of shown) {
  if (Math.abs(claimed - measured) > 5e-5) label.push(`${name} shows ${pct(claimed)} but is ${pct(measured)}`);
}
for (const [name, claimed, a] of simShown) {
  const mean = -a.sum / a.n;
  const se = Math.sqrt(Math.max(0, a.sq / a.n - mean * mean) / a.n);
  if (Math.abs(claimed - mean) > 3.29 * se) label.push(`${name} shows ${pct(claimed)} but measures ${pct(mean)} ±${pct(1.96 * se)}`);
}

const seconds = (performance.now() - started) / 1000;

// ---------------------------------------------------------------------------
// Report.

const MARK: Record<Verdict, string> = { pass: '✓', close: '≈', fail: '✗', known: '!', info: '·' };
const lines: string[] = [];
let game = '';
for (const row of rows) {
  if (row.game !== game) {
    game = row.game;
    lines.push(`\n${game}`);
  }
  const ours = `${pct(row.ours)}${row.margin !== undefined ? ` ±${pct(row.margin)}` : ''}`;
  const ref = row.reference !== undefined ? pct(row.reference) : '';
  lines.push(`  ${MARK[row.verdict]} ${row.bet.padEnd(42)} ${ours.padStart(18)}  vs ${ref.padStart(8)}   ${row.method}`);
  if (row.detail) lines.push(`      ${row.detail}`);
}
const failures = rows.filter((r) => r.verdict === 'fail');
const close = rows.filter((r) => r.verdict === 'close');
const known = rows.filter((r) => r.verdict === 'known');
console.log(`Odds audit · seed "${values.seed}" · ${seconds.toFixed(0)}s on ${workers} processes`);
console.log('House edge as measured, against the reference it is held to');
console.log('(✓ agrees · ≈ borderline · ! differs from the source for the reason given · ✗ disagrees)');
console.log(lines.join('\n'));
const agreed = rows.length - failures.length - close.length - known.length;
console.log(`\n${agreed} agree, ${close.length} borderline, ${known.length} explained, ${failures.length} disagree.`);
if (label.length) console.log(`\nIn-game labels out of date:\n  ${label.join('\n  ')}`);
else console.log('Every house edge shown in the game matches what was measured.');
if (failures.length || label.length) process.exitCode = 1;

if (values.out) {
  const md = [
    '# Odds audit',
    '',
    `Generated by \`npm run audit\` (seed \`${values.seed}\`, ${seconds.toFixed(0)}s on ${workers} processes).`,
    'House edges are positive when the house wins. **Exact** rows deal every possible hand through the',
    'simulator; the others are simulated through the real round engines, with a 95% margin.',
    '',
    '✓ agrees · ≈ borderline (within 99.9%) · ! differs from the source for the reason given · ✗ disagrees.',
    '',
    '| | Game | Bet | Measured | Reference | Method | Notes |',
    '|---|---|---|---|---|---|---|',
    ...rows.map((r) => {
      const ours = `${pct(r.ours)}${r.margin !== undefined ? ` ± ${pct(r.margin)}` : ''}`;
      const ref = r.reference !== undefined ? `${pct(r.reference)} (${r.referenceLabel})` : '';
      return `| ${MARK[r.verdict]} | ${r.game} | ${r.bet} | ${ours} | ${ref} | ${r.method} | ${r.detail ?? ''} |`;
    }),
    '',
  ].join('\n');
  writeFileSync(values.out, md);
  console.log(`\nWrote ${values.out}`);
}
