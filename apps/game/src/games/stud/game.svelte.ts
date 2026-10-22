import {
  bestFive,
  decideStud,
  simulateStudRound,
  stepWithChoices,
  STUD_RULES,
  type Card,
  type PokerHand,
  type StudChoice,
  type StudDecision,
  type StudEvent,
  type StudRoundResult,
} from '@idlesuits/sim';
import type { BreakdownLine } from '../../lib/breakdown';
import { bankroll } from '../../lib/casino.svelte';
import { Decimal } from '../../lib/money';
import { Sequencer } from '../../lib/sequencer.svelte';
import { sfx } from '../../lib/sound';

const STARTING_ANTE = 5;

const BASE_MS: Record<StudEvent['type'], number> = {
  RoundStarted: 150,
  HoleCards: 320,
  Decision: 120,
  Bet: 260,
  Folded: 300,
  CommunityCard: 520,
  FinalHand: 360,
  RoundSettled: 420,
};
const RESULT_HOLD_MS = 1500;

export interface Pending {
  decision: StudDecision;
  suggestion: StudChoice;
}

export interface HistoryEntry {
  round: number;
  hand: string;
  net: Decimal;
}

const STREET_NAME = { 3: '3rd street', 4: '4th street', 5: '5th street' } as const;

function newSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

export class StudGame {
  readonly rules = STUD_RULES;
  readonly seq = new Sequencer<StudChoice>();

  runSeed = $state(newSeed());
  round = $state(0);
  ante = $state(new Decimal(STARTING_ANTE));
  roundAnte = $state(new Decimal(STARTING_ANTE));
  lastAnte = $state(new Decimal(STARTING_ANTE));
  started = $state(false);
  gameOver = $state(false);
  autoPlay = $state(false);
  pending = $state<Pending | null>(null);

  hole = $state<(Card | null)[]>([null, null]);
  community = $state<(Card | null)[]>([null, null, null]);
  /** Street bets in antes, in order; nulls are streets not reached yet. */
  bets = $state<(number | null)[]>([null, null, null]);
  folded = $state(false);
  hand = $state<PokerHand | null>(null);
  multiplier = $state<number | null>(null);
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

  get best(): Set<string> {
    const shown = [...this.hole, ...this.community].filter((c): c is Card => c !== null);
    if (shown.length < 5) return new Set();
    return new Set(bestFive(shown).map((c) => c.uid));
  }

  /** Everything on the table so far: ante plus street bets. */
  get wagered(): number {
    return 1 + this.bets.reduce<number>((sum, b) => sum + (b ?? 0), 0);
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
    else if (this.seq.awaiting === 'deal') this.seq.answer({ move: 'fold' });
  }

  choose(choice: StudChoice) {
    if (this.seq.awaiting === 'move') this.seq.answer(choice);
  }

  deal() {
    if (this.seq.awaiting === 'deal') this.seq.answer({ move: 'fold' });
  }

  advance() {
    if (this.seq.awaiting === 'move') this.seq.answer(this.pending!.suggestion);
    else this.deal();
  }

  changeAnte(factor: number) {
    const next = this.ante.mul(factor).floor().max(1);
    this.ante = next.gt(this.bank) ? this.bank.floor().max(1) : next;
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
    this.roundAnte = ante;
    const seed = { run: this.runSeed, round: this.round };
    const run = (decide: (d: StudDecision) => StudChoice, onEvent: (e: StudEvent) => void) =>
      simulateStudRound({ seed, decide, onEvent });

    const choices: StudChoice[] = [];
    let shown = 0;
    for (;;) {
      const step = stepWithChoices(run, choices);
      if (!(await this.show(step.events.slice(shown)))) return false;
      shown = step.events.length;

      if (step.kind === 'done') {
        this.settle(step.result, ante);
        return true;
      }

      const suggestion = decideStud(step.decision);
      let choice: StudChoice | null = suggestion;
      if (!this.autoPlay) {
        this.pending = { decision: step.decision, suggestion };
        choice = await this.seq.ask('move');
        this.pending = null;
      }
      if (choice === null) return false;
      choices.push(choice);
    }
  }

  private async show(events: StudEvent[]): Promise<boolean> {
    for (const event of events) {
      const smart = this.seq.speed === 'smart';
      let ms = BASE_MS[event.type];
      // Smart pacing: the last card is the one everyone is waiting for.
      if (smart && event.type === 'CommunityCard') ms *= event.index === 2 ? 1.6 : 0.8;
      if (smart && event.type === 'Bet') ms *= 0.7;
      if (!(await this.seq.wait(ms))) return false;
      this.apply(event);
    }
    return true;
  }

  private apply(event: StudEvent) {
    switch (event.type) {
      case 'RoundStarted':
        this.hole = [null, null];
        this.community = [null, null, null];
        this.bets = [null, null, null];
        this.folded = false;
        this.hand = null;
        this.multiplier = null;
        this.net = null;
        this.breakdown = [];
        break;
      case 'HoleCards':
        this.hole = [...event.cards];
        sfx.flip();
        break;
      case 'Bet':
        this.bets[event.street - 3] = event.size;
        sfx.chip();
        break;
      case 'Folded':
        this.folded = true;
        this.breakdown = [{ label: `Folded on ${STREET_NAME[event.street]}`, amount: -event.lost }];
        sfx.lose();
        break;
      case 'CommunityCard':
        this.community[event.index] = event.card;
        sfx.flip();
        break;
      case 'FinalHand': {
        this.hand = event.hand;
        this.multiplier = event.multiplier;
        const label =
          event.multiplier > 0 ? `pays ${event.multiplier}:1` : event.multiplier === 0 ? 'push' : 'loses';
        this.breakdown = [
          { label: `Ante · ${label}`, amount: event.multiplier },
          ...this.bets.map((b, i) => ({
            label: `${STREET_NAME[(i + 3) as 3 | 4 | 5]} ${b}× · ${label}`,
            amount: (b ?? 0) * event.multiplier,
          })),
        ];
        break;
      }
      case 'RoundSettled':
        this.net = event.net;
        this.last = { lines: [...this.breakdown], net: event.net };
        if (event.net >= 10) sfx.bigWin();
        else if (event.net > 0) sfx.win();
        else if (event.net < 0 && !this.folded) sfx.lose();
        break;
      case 'Decision':
        break;
    }
  }

  private settle(result: StudRoundResult, ante: Decimal) {
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
      hand: result.folded ? `fold ${STREET_NAME[(3 + result.bets.length) as 3 | 4 | 5]}` : (result.hand ? shortName(result.hand) : ''),
      net,
    };
    this.history = [entry, ...this.history].slice(0, 12);
    if (this.bank.lte(0)) this.gameOver = true;
    else if (this.ante.gt(this.bank)) this.ante = this.bank.floor().max(1);
  }
}

const SHORT = ['High card', 'Pair', 'Two pair', 'Trips', 'Straight', 'Flush', 'Full house', 'Quads', 'Str flush', 'Royal'];
function shortName(hand: PokerHand): string {
  if (hand.category === 1 && hand.madeRank) return `Pair of ${hand.madeRank >= 11 ? ['J', 'Q', 'K', 'A'][hand.madeRank - 11] : hand.madeRank}s`;
  return SHORT[hand.category]!;
}
