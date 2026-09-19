import { parseArgs } from 'node:util';
import { buildShoe, DEFAULT_RULES, OPTIMAL_BASE_POLICY, standardDeck, type RaisePolicy } from '@idlesuits/sim';
import { elementOfRisk, mainEdge, runBatch, sideBetEdge, type BatchStats } from './batch';

const POLICIES: Record<string, RaisePolicy> = {
  optimal: OPTIMAL_BASE_POLICY,
  alwaysMax: { kind: 'alwaysMax' },
  fourPlus: { kind: 'threshold', minSize: 4, threshold: [15, 15, 15, 15] },
};

const { values } = parseArgs({
  options: {
    hands: { type: 'string', default: '1000000' },
    seed: { type: 'string', default: 'balance' },
    policy: { type: 'string', default: 'optimal' },
    'dealer-sidebets': { type: 'boolean', default: false },
  },
});

const hands = Number(values.hands);
const policy = POLICIES[values.policy];
if (!policy) throw new Error(`Unknown policy "${values.policy}". Options: ${Object.keys(POLICIES).join(', ')}`);

const dealerOwns = values['dealer-sidebets'];
const rules = { ...DEFAULT_RULES, unclaimedOwner: dealerOwns ? ('dealer' as const) : ('none' as const) };
const sideBets = dealerOwns ? {} : Object.fromEntries(rules.sideBets.map((b) => [b.id, 1]));

const shoe = buildShoe(standardDeck('player'));
const started = performance.now();
const stats = runBatch({ shoe, seat: { raisePolicy: policy, sideBets }, rules, runSeed: values.seed, dealerId: 'standard', hands });
const seconds = (performance.now() - started) / 1000;

const pct = (x: number, digits = 3) => `${(x * 100).toFixed(digits)}%`;
const pad = (s: string, n: number) => s.padEnd(n);

function distribution(title: string, counts: BatchStats['playerFlush']) {
  console.log(`\n${title}`);
  for (const [size, count] of Object.entries(counts).sort(([a], [b]) => Number(a) - Number(b))) {
    console.log(`  ${pad(`${size}-card`, 10)} ${pct(count / stats.hands, 4).padStart(10)}`);
  }
}

console.log(`Shoe: standard 52 | Policy: ${values.policy} | Seed: ${values.seed}`);
console.log(`Hands: ${hands.toLocaleString()} in ${seconds.toFixed(2)}s (${Math.round(hands / seconds).toLocaleString()} hands/s)`);

console.log('\nMain game');
console.log(`  ${pad('EV per ante', 22)} ${pct(mainEdge(stats))}`);
console.log(`  ${pad('Element of risk', 22)} ${pct(elementOfRisk(stats))}`);
console.log(`  ${pad('Avg total wager', 22)} ${(stats.mainWagered / stats.hands).toFixed(3)} antes`);
console.log(`  ${pad('Dealer qualifies', 22)} ${pct(stats.dealerQualified / stats.hands, 2)}`);
for (const [outcome, count] of Object.entries(stats.outcomes)) {
  console.log(`  ${pad(outcome, 22)} ${pct(count / stats.hands, 2)}`);
}

console.log('\nSide bets');
for (const [id, bet] of Object.entries(stats.sideBets)) {
  console.log(`  ${pad(`${id} (${bet.owner})`, 26)} EV ${pct(sideBetEdge(bet)).padStart(9)}   hit ${pct(bet.hits / stats.hands, 2)}`);
}

distribution('Player flush size', stats.playerFlush);
distribution('Dealer flush size', stats.dealerFlush);

console.log(`\nNet: ${stats.net.toFixed(0)} antes | biggest win ${stats.biggestWin} | biggest loss ${stats.biggestLoss}`);
