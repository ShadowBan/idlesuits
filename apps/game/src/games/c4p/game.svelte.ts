import {
  C4P_BONUSES,
  C4P_RULES,
  decideC4p,
  FOUR_CARD_NAMES,
  fourCategoryOf,
  simulateC4pRound,
  stepWithChoices,
  type BonusResult,
  type C4pChoice,
  type C4pDecision,
  type C4pEvent,
  type C4pRoundResult,
  type Card,
} from '@idlesuits/sim';
import type { BreakdownLine } from '../../lib/breakdown';
import { bankroll } from '../../lib/casino.svelte';
import { Decimal } from '../../lib/money';
import { Sequencer } from '../../lib/sequencer.svelte';
import { bonusLine, SideStakes } from '../../lib/sidebets.svelte';
import { ChipBets } from '../../lib/stakes.svelte';
import { sfx } from '../../lib/sound';

const STARTING_ANTE = 5;

/** Milliseconds at 1× before each event is shown. */
const BASE_MS: Record<C4pEvent['type'], number> = {
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

const PART_LABEL = { ante: 'Ante', play: 'Play', superBonus: 'Super Bonus' } as const;

export interface HistoryEntry {
  round: number;
  player: string;
  dealer: string;
  net: Decimal;
}

function newSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

export class C4pGame {
  readonly rules = C4P_RULES;
  readonly seq = new Sequencer<C4pChoice>();

  runSeed = $state(newSeed());
  round = $state(0);
  ante = $state(new Decimal(STARTING_ANTE));
  /** Side bets for the next hand, in dollars. */
  readonly side = new SideStakes(C4P_BONUSES);
  /** Chips on the spots for the next hand. */
  readonly bets = new ChipBets(
    () => this.ante,
    (v) => (this.ante = v),
    this.side,
    () => this.bank,
    2,
  );
  /** Counts deals, so the table can throw each new hand in from the shoe. */
  deals = $state(0);
  /** The dealer card about to turn, for a moment of suspense. */
  dealerFocus = $state(-1);
  roundAnte = $state(new Decimal(STARTING_ANTE));
  lastAnte = $state(new Decimal(STARTING_ANTE));
  started = $state(false);
  gameOver = $state(false);
  autoPlay = $state(false);
  suggestion = $state<C4pChoice | null>(null);
  /** Play sizes on offer while deciding: [1], or [1, 3] with a pair of aces or better. */
  sizes = $state<number[]>([1]);

  player = $state<(Card | null)[]>(Array(5).fill(null));
  dealer = $state<(Card | null)[]>(Array(5).fill(null));
  /** Best-four scores, and the card each hand leaves out. */
  playerScore = $state<number | null>(null);
  dealerScore = $state<number | null>(null);
  playerDiscard = $state(-1);
  dealerDiscard = $state(-1);
  opens = $state<boolean | null>(null);
  /** Play bet in antes, once made. */
  play = $state(0);
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
    else if (this.seq.awaiting === 'deal' && this.bets.canDeal) this.seq.answer({ move: 'fold' });
  }

  choose(choice: C4pChoice) {
    if (this.seq.awaiting === 'move') this.seq.answer(choice);
  }

  deal() {
    if (this.seq.awaiting === 'deal' && this.bets.canDeal) this.seq.answer({ move: 'fold' });
  }

  advance() {
    if (this.seq.awaiting === 'move') this.seq.answer(this.suggestion!);
    else this.deal();
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

  /** Bets go down before every hand; auto play deals on its own once there is a bet. */
  private async loop() {
    while (this.started && !this.gameOver && !this.seq.disposed) {
      const auto = this.autoPlay && this.bets.canDeal && this.hands > 0;
      const ok = auto ? await this.seq.wait(RESULT_HOLD_MS) : (await this.seq.ask('deal')) !== null;
      if (!ok) return;
      if (!this.bets.canDeal) continue;
      if (!(await this.playRound())) return;
    }
  }

  private async playRound(): Promise<boolean> {
    const ante = this.ante;
    const bonuses = this.side.units(ante);
    this.roundAnte = ante;
    const seed = { run: this.runSeed, round: this.round };
    const run = (decide: (d: C4pDecision) => C4pChoice, onEvent: (e: C4pEvent) => void) =>
      simulateC4pRound({ seed, bonuses, decide, onEvent });

    const choices: C4pChoice[] = [];
    let shown = 0;
    for (;;) {
      const step = stepWithChoices(run, choices);
      if (!(await this.show(step.events.slice(shown)))) return false;
      shown = step.events.length;

      if (step.kind === 'done') {
        this.settle(step.result, ante);
        return true;
      }

      const suggestion = decideC4p(step.decision.cards, this.rules.bigPlay);
      let choice: C4pChoice | null = suggestion;
      if (!this.autoPlay) {
        this.suggestion = suggestion;
        this.sizes = step.decision.sizes;
        choice = await this.seq.ask('move');
        this.suggestion = null;
      }
      if (choice === null) return false;
      choices.push(choice);
    }
  }

  private async show(events: C4pEvent[]): Promise<boolean> {
    for (const event of events) {
      if (event.type === 'DealerRevealed') {
        // The dealer turns over one card at a time; the next one lifts first.
        const step = BASE_MS.DealerRevealed * (event.cards.length > 4 ? 0.3 : 0.45);
        for (let i = 0; i < event.cards.length; i++) {
          if (this.dealer[i]) continue;
          this.dealerFocus = i;
          if (!(await this.seq.wait(step))) return false;
          this.dealer[i] = event.cards[i]!;
          sfx.flip();
        }
        this.dealerFocus = -1;
      }
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

  private apply(event: C4pEvent) {
    switch (event.type) {
      case 'RoundStarted':
        this.deals++;
        this.bets.touched = false;
        this.dealerFocus = -1;
        this.player = Array(5).fill(null);
        this.dealer = Array(5).fill(null);
        this.playerScore = null;
        this.dealerScore = null;
        this.playerDiscard = -1;
        this.dealerDiscard = -1;
        this.opens = null;
        this.play = 0;
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
        this.playerDiscard = event.discard;
        sfx.flip();
        break;
      case 'Played':
        this.play = event.size;
        sfx.chip();
        break;
      case 'Folded':
        this.folded = true;
        sfx.lose();
        break;
      case 'DealerRevealed':
        this.dealer = [...event.cards];
        this.dealerScore = event.score;
        this.dealerDiscard = event.discard;
        this.opens = event.opens;
        sfx.flip();
        break;
      case 'Settled':
        this.results[event.part] = { net: event.net, note: event.note };
        this.breakdown.push({ label: `${PART_LABEL[event.part]} · ${event.note}`, amount: event.net });
        break;
      case 'BonusSettled':
        this.bonusResults[event.result.id] = event.result;
        this.breakdown.push(bonusLine(C4P_BONUSES, event.result));
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

  private settle(result: C4pRoundResult, ante: Decimal) {
    const net = ante.mul(result.net);
    this.lastAnte = ante;
    bankroll.settle(net);
    this.sessionNet = this.sessionNet.add(net);
    if (net.gt(this.biggestWin)) this.biggestWin = net;
    if (result.folded) this.folds++;
    this.hands++;
    this.round++;
    const short = (score: number) => FOUR_CARD_NAMES[fourCategoryOf(score)];
    const entry: HistoryEntry = {
      round: this.round,
      player: result.folded ? 'fold' : short(result.playerScore),
      dealer: result.opens ? short(result.dealerScore) : 'no open',
      net,
    };
    this.history = [entry, ...this.history].slice(0, 12);
    if (this.bank.lte(0)) this.gameOver = true;
    else this.bets.fitToBank();
  }
}
