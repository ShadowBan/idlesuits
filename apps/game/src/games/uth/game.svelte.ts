import {
  bestFive,
  decideUth,
  PREFLOP_CHART,
  riverOdds,
  simulateUthRound,
  standardDeck,
  stepWithChoices,
  UTH_RULES,
  type Card,
  type PokerHand,
  type RiverOdds,
  type UthDecision,
  type UthEvent,
  type UthMove,
  type UthRoundResult,
} from '@idlesuits/sim';
import type { BreakdownLine } from '../../lib/breakdown';
import { bankroll } from '../../lib/casino.svelte';
import { Decimal } from '../../lib/money';
import { Sequencer } from '../../lib/sequencer.svelte';
import { sfx } from '../../lib/sound';

type Choice = { move: UthMove; raise?: number };

const STARTING_ANTE = 5;
const DECK = standardDeck('player');
const STRATEGY = { chart: PREFLOP_CHART };

/** Milliseconds at 1× before each event is shown. */
const BASE_MS: Record<UthEvent['type'], number> = {
  RoundStarted: 150,
  HoleCards: 320,
  DealerCards: 220,
  Decision: 120,
  Played: 300,
  Checked: 220,
  Folded: 300,
  BoardRevealed: 360,
  PlayerHand: 200,
  DealerRevealed: 700,
  Settled: 240,
  RoundSettled: 420,
};
const RESULT_HOLD_MS = 1600;

const PART_LABEL = { ante: 'Ante', blind: 'Blind', play: 'Play', trips: 'Trips' } as const;

export interface Pending {
  decision: UthDecision;
  suggestion: Choice;
  /** Only on the river, where the odds can be computed exactly. */
  odds: RiverOdds | null;
}

export interface HistoryEntry {
  round: number;
  player: string;
  dealer: string;
  net: Decimal;
}

function newSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

export class UthGame {
  readonly rules = UTH_RULES;
  readonly seq = new Sequencer<Choice>();

  runSeed = $state(newSeed());
  round = $state(0);
  ante = $state(new Decimal(STARTING_ANTE));
  /** Trips side bet in dollars; zero is off. */
  trips = $state(new Decimal(0));
  roundAnte = $state(new Decimal(STARTING_ANTE));
  lastAnte = $state(new Decimal(STARTING_ANTE));
  started = $state(false);
  gameOver = $state(false);
  autoPlay = $state(false);
  pending = $state<Pending | null>(null);

  // The table, as the events have revealed it.
  hole = $state<(Card | null)[]>([null, null]);
  dealer = $state<(Card | null)[]>([null, null]);
  board = $state<(Card | null)[]>([null, null, null, null, null]);
  playerHand = $state<PokerHand | null>(null);
  dealerHand = $state<PokerHand | null>(null);
  dealerQualified = $state<boolean | null>(null);
  /** Play bet in antes, once made. */
  play = $state(0);
  tripsUnits = $state(0);
  folded = $state(false);
  checks = $state(0);
  results = $state<Partial<Record<keyof typeof PART_LABEL, { net: number; note: string }>>>({});
  net = $state<number | null>(null);
  breakdown = $state<BreakdownLine[]>([]);
  last = $state<{ lines: BreakdownLine[]; net: number } | null>(null);

  hands = $state(0);
  sessionNet = $state(new Decimal(0));
  biggestWin = $state(new Decimal(0));
  folds = $state(0);
  history = $state<HistoryEntry[]>([]);

  get bank(): Decimal {
    return bankroll.balance;
  }

  /** The player's best five, for highlighting on the felt. */
  get playerBest(): Set<string> {
    const shown = [...this.hole, ...this.board].filter((c): c is Card => c !== null);
    if (shown.length < 5) return new Set();
    return new Set(bestFive(shown).map((c) => c.uid));
  }

  start() {
    if (this.started || this.seq.disposed) return;
    this.started = true;
    void this.loop();
  }

  setAutoPlay(on: boolean) {
    this.autoPlay = on;
    if (!on) return;
    if (this.seq.awaiting === 'move') this.seq.answer(this.pending!.suggestion);
    else if (this.seq.awaiting === 'deal') this.seq.answer({ move: 'check' });
  }

  choose(choice: Choice) {
    if (this.seq.awaiting === 'move') this.seq.answer(choice);
  }

  deal() {
    if (this.seq.awaiting === 'deal') this.seq.answer({ move: 'check' });
  }

  /** Space: take the suggestion, or deal. */
  advance() {
    if (this.seq.awaiting === 'move') this.seq.answer(this.pending!.suggestion);
    else this.deal();
  }

  changeAnte(factor: number) {
    const next = this.ante.mul(factor).floor().max(1);
    this.ante = next.gt(this.bank) ? this.bank.floor().max(1) : next;
  }

  /** Halve or double Trips; below $1 it switches off, and from off it starts at the ante. */
  changeTrips(factor: number) {
    let next = this.trips.eq(0) ? (factor > 1 ? this.ante : this.trips) : this.trips.mul(factor).floor();
    if (next.lt(1)) next = new Decimal(0);
    this.trips = next;
  }

  dispose() {
    this.seq.dispose();
    this.started = false;
  }

  restart() {
    this.seq.reset();
    this.runSeed = newSeed();
    this.round = 0;
    bankroll.buyIn();
    this.ante = new Decimal(STARTING_ANTE);
    this.trips = new Decimal(0);
    this.hands = 0;
    this.folds = 0;
    this.sessionNet = new Decimal(0);
    this.biggestWin = new Decimal(0);
    this.history = [];
    this.last = null;
    this.gameOver = false;
    this.started = false;
    this.start();
  }

  private async loop() {
    while (this.started && !this.gameOver && !this.seq.disposed) {
      if (!(await this.playRound())) return;
      if (this.gameOver) return;
      const ok = this.autoPlay ? await this.seq.wait(RESULT_HOLD_MS) : (await this.seq.ask('deal')) !== null;
      if (!ok) return;
    }
  }

  private async playRound(): Promise<boolean> {
    const ante = this.ante;
    const tripsUnits = this.trips.gt(0) ? this.trips.div(ante).toNumber() : 0;
    this.roundAnte = ante;
    const seed = { run: this.runSeed, round: this.round };
    const run = (decide: (d: UthDecision) => Choice, onEvent: (e: UthEvent) => void) =>
      simulateUthRound({ seed, trips: tripsUnits, decide, onEvent });

    const choices: Choice[] = [];
    let shown = 0;
    for (;;) {
      const step = stepWithChoices(run, choices);
      if (!(await this.show(step.events.slice(shown)))) return false;
      shown = step.events.length;

      if (step.kind === 'done') {
        this.settle(step.result, ante);
        return true;
      }

      const decision = step.decision;
      const suggestion = decideUth(STRATEGY, decision, DECK);
      const odds = decision.street === 'river' ? riverOdds(decision.hole, decision.board, DECK) : null;
      let choice: Choice | null = suggestion;
      if (!this.autoPlay) {
        this.pending = { decision, suggestion, odds };
        choice = await this.seq.ask('move');
        this.pending = null;
      }
      if (choice === null) return false;
      choices.push(choice);
    }
  }

  private async show(events: UthEvent[]): Promise<boolean> {
    for (const event of events) {
      if (event.type === 'BoardRevealed') {
        // Turn the board cards one at a time.
        const offset = event.street === 'flop' ? 0 : 3;
        for (let i = 0; i < event.cards.length; i++) {
          if (!(await this.seq.wait(BASE_MS.BoardRevealed * (this.seq.speed === 'smart' ? 0.6 : 1)))) return false;
          this.board[offset + i] = event.cards[i]!;
          sfx.flip();
        }
        continue;
      }
      if (!(await this.seq.wait(this.delay(event)))) return false;
      this.apply(event);
    }
    return true;
  }

  private delay(event: UthEvent): number {
    const base = BASE_MS[event.type];
    if (this.seq.speed !== 'smart') return base;
    // Linger on the dealer's reveal and on anything big; hurry the rest.
    if (event.type === 'DealerRevealed') return base * (this.play >= 2 ? 1.4 : 1);
    if (event.type === 'Settled') return base * (Math.abs(event.net) >= 3 ? 1.5 : 0.7);
    return base * 0.8;
  }

  private apply(event: UthEvent) {
    switch (event.type) {
      case 'RoundStarted':
        this.hole = [null, null];
        this.dealer = [null, null];
        this.board = [null, null, null, null, null];
        this.playerHand = null;
        this.dealerHand = null;
        this.dealerQualified = null;
        this.play = 0;
        this.tripsUnits = event.trips;
        this.folded = false;
        this.checks = 0;
        this.results = {};
        this.net = null;
        this.breakdown = [];
        break;
      case 'HoleCards':
        this.hole = [...event.cards];
        sfx.flip();
        break;
      case 'DealerCards':
        this.dealer = [null, null];
        break;
      case 'Played':
        this.play = event.raise;
        sfx.chip();
        break;
      case 'Checked':
        this.checks++;
        break;
      case 'Folded':
        this.folded = true;
        sfx.lose();
        break;
      case 'PlayerHand':
        this.playerHand = event.hand;
        break;
      case 'DealerRevealed':
        this.dealer = [...event.cards];
        this.dealerHand = event.hand;
        this.dealerQualified = event.qualified;
        sfx.flip();
        break;
      case 'Settled':
        this.results[event.part] = { net: event.net, note: event.note };
        this.breakdown.push({ label: `${PART_LABEL[event.part]} · ${event.note}`, amount: event.net });
        break;
      case 'RoundSettled':
        this.net = event.net;
        this.last = { lines: [...this.breakdown], net: event.net };
        if (event.net >= 6) sfx.bigWin();
        else if (event.net > 0) sfx.win();
        else if (event.net < 0) sfx.lose();
        break;
      case 'Decision':
      case 'BoardRevealed':
        break;
    }
  }

  private settle(result: UthRoundResult, ante: Decimal) {
    const net = ante.mul(result.net);
    this.lastAnte = ante;
    bankroll.settle(net);
    this.sessionNet = this.sessionNet.add(net);
    if (net.gt(this.biggestWin)) this.biggestWin = net;
    if (result.folded) this.folds++;
    this.hands++;
    this.round++;
    const entry: HistoryEntry = {
      round: this.round,
      player: result.folded ? 'fold' : shortName(result.playerHand),
      dealer: shortName(result.dealerHand),
      net,
    };
    this.history = [entry, ...this.history].slice(0, 12);

    if (this.bank.lte(0)) this.gameOver = true;
    else if (this.ante.gt(this.bank)) this.ante = this.bank.floor().max(1);
  }
}

const SHORT = ['High', 'Pair', '2 pair', 'Trips', 'Straight', 'Flush', 'Full', 'Quads', 'Str flush', 'Royal'];
function shortName(hand: PokerHand): string {
  return SHORT[hand.category]!;
}
