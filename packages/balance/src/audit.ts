import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  BJ_POT_OF_GOLD,
  C4P_QUEENS_UP,
  CSP_FIVE_PLUS_ONE,
  DJ_BAD_BEAT,
  DJ_TRIPS,
  LIR_FIVE_CARD,
  LIR_THREE_CARD,
  BJ_PUSH_22,
  FLUSH_RUSH,
  lookupScale,
  PG_EMPEROR,
  PG_FORTUNE,
  PG_INSURANCE,
  STUD_THREE_CARD,
  SUPER_FLUSH_RUSH,
  TCP_PAIR_PLUS,
  TCP_PRIME,
  TCP_SIX_CARD,
  UTH_BAD_BEAT,
  UTH_HOLE_CARD,
  UTH_SIX_CARD,
  UTH_TRIPS,
  type BonusBet,
  type SideBetDef,
} from '@idlesuits/sim';
import { chanceOfFreeBet } from './audit/blackjack-exact';
import {
  djTripsCounts,
  fiveCardCounts,
  holeCardCounts,
  lirCounts,
  mergeCounts,
  pairPlusCounts,
  paiGowSevenCounts,
  primeCounts,
  sixCardCounts,
  studMainTotals,
  suitsCounts,
  tcpMainCounts,
  threeCardCounts,
  tripsCounts,
  type Counts,
} from './audit/exact';
import { PAI_GOW_HANDS, PUBLISHED, type Reference } from './audit/published';
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
  tcpMain: tcpMainCounts,
  prime: primeCounts,
  paiGowSeven: paiGowSevenCounts,
  lir: lirCounts,
} as const;

const ROUNDS: Record<SimGame, number> = { suits: 8e6, blackjack: 40e6, uth: 8e6, stud: 40e6, tcp: 20e6, paigow: 16e6, lir: 20e6, csp: 40e6, c4p: 40e6, dj: 40e6 };

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

// Three Card Poker
const tcp = exact.tcpMain!;
{
  let deals = 0;
  let net = 0;
  for (const [win, n] of Object.entries(tcp)) {
    deals += n;
    net += Number(win) * n;
  }
  const tcpEdge = -net / deals;
  exactRow('Three Card Poker', 'Ante and Play, per ante', tcpEdge, PUBLISHED.tcpMain, tcp,
    `all ${deals.toLocaleString()} deals, played queen-6-4 or better`);
  simRow('Three Card Poker', 'Ante and Play, dealt through the table', acc('tcp', 'main'), tcpEdge, 'exact, above');
}
const pairPlus = pairPlusCounts();
const pairPlusEdge = edgeOfBonus(TCP_PAIR_PLUS as BonusBet<never>, pairPlus);
exactRow('Three Card Poker', 'Pairplus', pairPlusEdge, PUBLISHED.pairPlus, pairPlus);
simRow('Three Card Poker', 'Pairplus, dealt through the table', acc('tcp', 'pairPlus'), pairPlusEdge, 'exact, above');
const tcpSixEdge = edgeOfBonus(TCP_SIX_CARD as BonusBet<never>, exact.sixCard!);
exactRow('Three Card Poker', '6-Card Bonus', tcpSixEdge, PUBLISHED.sixCard, exact.sixCard,
  'the same six-card count as Ultimate’s, through the same rule');
simRow('Three Card Poker', '6-Card Bonus, dealt through the table', acc('tcp', 'sixCard'), tcpSixEdge, 'exact, above');
const prime = exact.prime!;
const primeEdge = edgeOfBonus(TCP_PRIME as BonusBet<never>, prime);
exactRow('Three Card Poker', 'Prime', primeEdge, PUBLISHED.prime, prime, 'counted by color over all 407,170,400 deals');
simRow('Three Card Poker', 'Prime, dealt through the table', acc('tcp', 'prime'), primeEdge, 'exact, above');

// Pai Gow Poker
const pgRounds = acc('paigow', 'main').n;
simRow('Pai Gow Poker', 'Main bet, both sides by the house way', acc('paigow', 'main'), PUBLISHED.paiGowMain.edge,
  PUBLISHED.paiGowMain.source,
  ['win', 'push', 'lose'].map((o) => `${o} ${pct(tally('paigow', o) / pgRounds)}`).join(', ') +
    ' (published 29.120% / 40.496% / 30.385%)');
const seven = exact.paiGowSeven!;
const part = (prefix: string) =>
  Object.fromEntries(Object.entries(seven).filter(([k]) => k.startsWith(`${prefix}:`)).map(([k, v]) => [k.slice(prefix.length + 1), v]));
{
  const hands = part('hand');
  const mismatched = Object.entries(PAI_GOW_HANDS).filter(([hand, n]) => hands[hand] !== n);
  rows.push({
    game: 'Pai Gow Poker',
    bet: 'Seven-card hands, joker included',
    method: 'exact',
    ours: NaN,
    verdict: mismatched.length ? 'fail' : 'pass',
    detail: mismatched.length
      ? `counts differ: ${mismatched.map(([h, n]) => `${h}: ${hands[h]} vs ${n}`).join('; ')}`
      : `all 154,143,080 hands land in the published counts, from five aces to high card`,
  });
}
const pgBets: [string, BonusBet<never>, Reference][] = [
  ['Fortune', PG_FORTUNE as BonusBet<never>, PUBLISHED.fortune],
  ["Emperor's Challenge", PG_EMPEROR as BonusBet<never>, PUBLISHED.emperor],
  ['Pai Gow Insurance', PG_INSURANCE as BonusBet<never>, PUBLISHED.insurance],
];
const pgEdges: Record<string, number> = {};
for (const [name, bet, ref] of pgBets) {
  const counts = part(bet.id);
  const edge = edgeOfBonus(bet, counts);
  pgEdges[bet.id] = edge;
  exactRow('Pai Gow Poker', name, edge, ref, counts);
  simRow('Pai Gow Poker', `${name}, dealt through the table`, acc('paigow', bet.id), edge, 'exact, above');
}

// Let It Ride
const lir = exact.lir!;
const lirEdge = -lir.net! / 51979200;
{
  const { net: _, ...lines } = lir;
  exactRow('Let It Ride', 'Main game, per bet', lirEdge, PUBLISHED.lirMain,
    Object.fromEntries(Object.entries(lines).filter(([, n]) => n > 0)),
    'all 51,979,200 deals; every line of the table, by bets left riding');
}
simRow('Let It Ride', 'Main game, dealt through the table', acc('lir', 'main'), lirEdge, 'exact, above');
const lirThree = threeCardCounts(LIR_THREE_CARD as BonusBet<never>);
const lirThreeEdge = edgeOfBonus(LIR_THREE_CARD as BonusBet<never>, lirThree);
exactRow('Let It Ride', '3-Card Bonus', lirThreeEdge, PUBLISHED.lirThreeCard, lirThree);
simRow('Let It Ride', '3-Card Bonus, dealt through the table', acc('lir', 'threeCard'), lirThreeEdge, 'exact, above');
const lirFive = fiveCardCounts(LIR_FIVE_CARD as BonusBet<never>, (cards) => ({ hole: cards.slice(0, 3), community: cards.slice(3) }));
const lirFiveEdge = edgeOfBonus(LIR_FIVE_CARD as BonusBet<never>, lirFive);
exactRow('Let It Ride', '5-Card Bonus', lirFiveEdge, PUBLISHED.lirFiveCard, lirFive, 'paid "for one": tens or better is a push');
simRow('Let It Ride', '5-Card Bonus, dealt through the table', acc('lir', 'fiveCard'), lirFiveEdge, 'exact, above');

// Caribbean Stud
simRow('Caribbean Stud', 'Ante and Raise, per ante', acc('csp', 'main'), PUBLISHED.cspMain.edge, PUBLISHED.cspMain.source,
  `raised ${pct(tally('csp', 'raised') / acc('csp', 'main').n, 2)} of hands (52.23% with perfect play)`);
const cspSixEdge = edgeOfBonus(CSP_FIVE_PLUS_ONE as BonusBet<never>, exact.sixCard!);
exactRow('Caribbean Stud', '5+1 Bonus', cspSixEdge, PUBLISHED.fivePlusOne, exact.sixCard,
  'the same six-card count and rule as the other 6-Card Bonus bets');
simRow('Caribbean Stud', '5+1 Bonus, dealt through the table', acc('csp', 'fivePlusOne'), cspSixEdge, 'exact, above');

// Crazy 4 Poker
{
  const n = acc('c4p', 'main').n;
  const per = (key: string) => (acc('c4p', key).sum / n).toFixed(5);
  simRow('Crazy 4 Poker', 'Ante, Play and Super Bonus, per ante', acc('c4p', 'main'), PUBLISHED.c4pMain.edge,
    PUBLISHED.c4pMain.source,
    `per ante: Ante ${per('ante')} (−0.171298), Play ${per('play')} (0.484904), Super Bonus ${per('superBonus')} ` +
      `(−0.347795); played 3× ${pct(tally('c4p', 'big') / n, 2)}, 1× ${pct(tally('c4p', 'small') / n, 2)}, ` +
      `folded ${pct(tally('c4p', 'fold') / n, 2)} (18.56% / 57.93% / 23.51%)`);
}
const queensUp = fiveCardCounts(C4P_QUEENS_UP as BonusBet<never>, (cards) => ({ player: cards, dealer: [] }));
const queensUpEdge = edgeOfBonus(C4P_QUEENS_UP as BonusBet<never>, queensUp);
exactRow('Crazy 4 Poker', 'Queens Up', queensUpEdge, PUBLISHED.queensUp, queensUp, 'scored on the best four of five cards');
simRow('Crazy 4 Poker', 'Queens Up, dealt through the table', acc('c4p', 'queensUp'), queensUpEdge, 'exact, above');

// DJ Wild
{
  const n = acc('dj', 'main').n;
  simRow('DJ Wild', 'Ante, Blind and Play, per ante', acc('dj', 'main'), PUBLISHED.djMain.edge, PUBLISHED.djMain.source,
    `folds ${pct(tally('dj', 'fold') / n, 2)} (30.68%), ties ${pct(tally('dj', 'tie') / n, 4)} (0.0114%)`);
}
const djTrips = djTripsCounts();
const djTripsEdge = edgeOfBonus(DJ_TRIPS as BonusBet<never>, djTrips);
exactRow('DJ Wild', 'Trips', djTripsEdge, PUBLISHED.djTrips, djTrips,
  'all 2,869,685 hands, deuces and the joker wild, natural and wild lines apart');
simRow('DJ Wild', 'Trips, dealt through the table', acc('dj', 'trips'), djTripsEdge, 'exact, above');
simRow('DJ Wild', 'Two-Way Bad Beat', acc('dj', 'badBeat'), DJ_BAD_BEAT.edge, 'no published figure: held to the 13.9% the game shows',
  'Pennsylvania pay table DJWBB-03; both hands need three of a kind or better');

// Side bets show their house edge in the game; it must be the one measured here.
const shown: [string, number, number][] = [
  ['Flush Rush', FLUSH_RUSH.edge, flushRushEdge],
  ['Super Flush Rush', SUPER_FLUSH_RUSH.edge, superEdge],
  ['Trips', UTH_TRIPS.edge, edgeOfBonus(UTH_TRIPS as BonusBet<never>, exact.trips!)],
  ['6-Card Bonus', UTH_SIX_CARD.edge, edgeOfBonus(UTH_SIX_CARD as BonusBet<never>, exact.sixCard!)],
  ['Hole Card Bonus', UTH_HOLE_CARD.edge, edgeOfBonus(UTH_HOLE_CARD as BonusBet<never>, exactBonus[2]![2])],
  ['3-Card Bonus', STUD_THREE_CARD.edge, threeEdge],
  ['Pairplus', TCP_PAIR_PLUS.edge, pairPlusEdge],
  ['6-Card Bonus (Three Card Poker)', TCP_SIX_CARD.edge, tcpSixEdge],
  ['Prime', TCP_PRIME.edge, primeEdge],
  ['Fortune', PG_FORTUNE.edge, pgEdges.fortune!],
  ["Emperor's Challenge", PG_EMPEROR.edge, pgEdges.emperor!],
  ['Pai Gow Insurance', PG_INSURANCE.edge, pgEdges.insurance!],
  ['3-Card Bonus (Let It Ride)', LIR_THREE_CARD.edge, lirThreeEdge],
  ['5-Card Bonus', LIR_FIVE_CARD.edge, lirFiveEdge],
  ['5+1 Bonus', CSP_FIVE_PLUS_ONE.edge, cspSixEdge],
  ['Queens Up', C4P_QUEENS_UP.edge, queensUpEdge],
  ['Trips (DJ Wild)', DJ_TRIPS.edge, djTripsEdge],
];
const simShown: [string, number, Acc][] = [
  ['Pot of Gold', BJ_POT_OF_GOLD.edge, acc('blackjack', 'potOfGold')],
  ['Push 22', BJ_PUSH_22.edge, acc('blackjack', 'push22')],
  ['Bad Beat', UTH_BAD_BEAT.edge, acc('uth', 'badBeat')],
  ['Two-Way Bad Beat', DJ_BAD_BEAT.edge, acc('dj', 'badBeat')],
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
  const ours = Number.isNaN(row.ours) ? '—' : `${pct(row.ours)}${row.margin !== undefined ? ` ±${pct(row.margin)}` : ''}`;
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
      const ours = Number.isNaN(r.ours) ? '—' : `${pct(r.ours)}${r.margin !== undefined ? ` ± ${pct(r.margin)}` : ''}`;
      const ref = r.reference !== undefined ? `${pct(r.reference)} (${r.referenceLabel})` : '';
      return `| ${MARK[r.verdict]} | ${r.game} | ${r.bet} | ${ours} | ${ref} | ${r.method} | ${r.detail ?? ''} |`;
    }),
    '',
  ].join('\n');
  writeFileSync(values.out, md);
  console.log(`\nWrote ${values.out}`);
}
