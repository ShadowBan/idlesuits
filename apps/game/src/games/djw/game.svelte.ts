import {
  decideDj,
  DJ_BONUSES,
  DJ_CATEGORY_NAMES,
  DJ_RULES,
  djCategoryOf,
  simulateDjRound,
  stepWithChoices,
  type BonusResult,
  type Card,
  type DjDecision,
  type DjEvent,
  type DjMove,
  type DjRoundResult,
} from '@idlesuits/sim';
import type { BreakdownLine } from '../../lib/breakdown';
import { bankroll } from '../../lib/casino.svelte';
import { Decimal } from '../../lib/money';
import { Sequencer } from '../../lib/sequencer.svelte';
import { bonusLine, SideStakes } from '../../lib/sidebets.svelte';
import { sfx } from '../../lib/sound';

const STARTING_ANTE = 5;

/** Milliseconds at 1× before each event is shown. */
const BASE_MS: Record<DjEvent['type'], number> = {
  RoundStarted: 150,
  PlayerCards: 380,
  DealerCards: 220,
  Decision: 120,
  Played: 260,
  Folded: 300,
  DealerRevealed: 700,
  Settled: 240,
  BonusSettled: 260,
  RoundSettled: 420,
};
const RESULT_HOLD_MS = 1400;

const PART_LABEL = { ante: 'Ante', blind: 'Blind', play: 'Play' } as const;

export interface HistoryEntry {
  round: number;
  player: string;
  dealer: string;
  net: Decimal;
}

function newSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

export class DjGame {
  readonly rules = DJ_RULES;
  readonly seq = new Sequencer<DjMove>();

  runSeed = $state(newSeed());
  round = $state(0);
  ante = $state(new Decimal(STARTING_ANTE));
  /** Side bets for the next hand, in dollars. */
  readonly side = new SideStakes(DJ_BONUSES);
  roundAnte = $state(new Decimal(STARTING_ANTE));
  lastAnte = $state(new Decimal(STARTING_ANTE));
  started = $state(false);
  gameOver = $state(false);
  autoPlay = $state(false);
  suggestion = $state<DjMove | null>(null);

  player = $state<(Card | null)[]>(Array(5).fill(null));
  dealer = $state<(Card | null)[]>(Array(5).fill(null));
  playerScore = $state<number | null>(null);
  dealerScore = $state<number | null>(null);
  played = $state(false);
  folded = $state(false);
  results = $state<Partial<Record<keyof typeof PART_LABEL, { net: number; note: string }>>>({});
  /** Side bets riding on this hand, in antes. */
  roundSide = $state<Record<string, number>>({});
  bonusResults = $state<Record<string, BonusResult>>({});
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

  start() {
    if (this.started || this.seq.disposed) return;
    this.started = true;
    void this.loop();
  }

  setAutoPlay(on: boolean) {
    this.autoPlay = on;
    if (!on) return;
    if (this.seq.awaiting === 'move') this.seq.answer(this.suggestion!);
    else if (this.seq.awaiting === 'deal') this.seq.answer('play');
  }

  choose(move: DjMove) {
    if (this.seq.awaiting === 'move') this.seq.answer(move);
  }

  deal() {
    if (this.seq.awaiting === 'deal') this.seq.answer('play');
  }

  advance() {
    if (this.seq.awaiting === 'move') this.seq.answer(this.suggestion!);
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
    this.side.reset();
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
    const bonuses = this.side.units(ante);
    this.roundAnte = ante;
    const seed = { run: this.runSeed, round: this.round };
    const run = (decide: (d: DjDecision) => DjMove, onEvent: (e: DjEvent) => void) =>
      simulateDjRound({ seed, bonuses, decide, onEvent });

    const choices: DjMove[] = [];
    let shown = 0;
    for (;;) {
      const step = stepWithChoices(run, choices);
      if (!(await this.show(step.events.slice(shown)))) return false;
      shown = step.events.length;

      if (step.kind === 'done') {
        this.settle(step.result, ante);
        return true;
      }

      const suggestion = decideDj(step.decision.cards);
      let choice: DjMove | null = suggestion;
      if (!this.autoPlay) {
        this.suggestion = suggestion;
        choice = await this.seq.ask('move');
        this.suggestion = null;
      }
      if (choice === null) return false;
      choices.push(choice);
    }
  }

  private async show(events: DjEvent[]): Promise<boolean> {
    for (const event of events) {
      let ms = BASE_MS[event.type];
      if (this.seq.speed === 'smart') {
        if (event.type === 'Settled' || event.type === 'BonusSettled') ms *= 0.7;
        else if (event.type !== 'DealerRevealed') ms *= 0.8;
      }
      if (!(await this.seq.wait(ms))) return false;
      this.apply(event);
    }
    return true;
  }

  private apply(event: DjEvent) {
    switch (event.type) {
      case 'RoundStarted':
        this.player = Array(5).fill(null);
        this.dealer = Array(5).fill(null);
        this.playerScore = null;
        this.dealerScore = null;
        this.played = false;
        this.folded = false;
        this.results = {};
        this.roundSide = event.bonuses;
        this.bonusResults = {};
        this.net = null;
        this.breakdown = [];
        break;
      case 'PlayerCards':
        this.player = [...event.cards];
        this.playerScore = event.score;
        sfx.flip();
        break;
      case 'Played':
        this.played = true;
        sfx.chip();
        break;
      case 'Folded':
        this.folded = true;
        sfx.lose();
        break;
      case 'DealerRevealed':
        this.dealer = [...event.cards];
        this.dealerScore = event.score;
        sfx.flip();
        break;
      case 'Settled':
        this.results[event.part] = { net: event.net, note: event.note };
        this.breakdown.push({ label: `${PART_LABEL[event.part]} · ${event.note}`, amount: event.net });
        break;
      case 'BonusSettled':
        this.bonusResults[event.result.id] = event.result;
        this.breakdown.push(bonusLine(DJ_BONUSES, event.result));
        if (event.result.net > 0) sfx.chip();
        break;
      case 'RoundSettled':
        this.net = event.net;
        this.last = { lines: [...this.breakdown], net: event.net };
        if (event.net >= 8) sfx.bigWin();
        else if (event.net > 0) sfx.win();
        else if (event.net < 0 && !this.folded) sfx.lose();
        break;
      case 'DealerCards':
      case 'Decision':
        break;
    }
  }

  private settle(result: DjRoundResult, ante: Decimal) {
    const net = ante.mul(result.net);
    this.lastAnte = ante;
    bankroll.settle(net);
    this.sessionNet = this.sessionNet.add(net);
    if (net.gt(this.biggestWin)) this.biggestWin = net;
    if (result.folded) this.folds++;
    this.hands++;
    this.round++;
    const short = (score: number) => DJ_CATEGORY_NAMES[djCategoryOf(score)];
    const entry: HistoryEntry = {
      round: this.round,
      player: result.folded ? 'fold' : short(result.playerScore),
      dealer: short(result.dealerScore),
      net,
    };
    this.history = [entry, ...this.history].slice(0, 12);
    if (this.bank.lte(0)) this.gameOver = true;
    else if (this.ante.gt(this.bank)) this.ante = this.bank.floor().max(1);
  }
}
