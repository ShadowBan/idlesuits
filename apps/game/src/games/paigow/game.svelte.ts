import {
  applySet,
  isLegalSet,
  PG_BONUSES,
  pgHandName,
  pgLowName,
  simulatePaiGowRound,
  stepWithChoices,
  type BonusResult,
  type Card,
  type HandWinner,
  type PaiGowDecision,
  type PaiGowEvent,
  type PaiGowOutcome,
  type PaiGowRoundResult,
  type PaiGowSet,
  type SetHands,
} from '@idlesuits/sim';
import type { BreakdownLine } from '../../lib/breakdown';
import { bankroll } from '../../lib/casino.svelte';
import { Decimal } from '../../lib/money';
import { Sequencer } from '../../lib/sequencer.svelte';
import { bonusLine, SideStakes } from '../../lib/sidebets.svelte';
import { ChipBets } from '../../lib/stakes.svelte';
import { sfx } from '../../lib/sound';

const STARTING_BET = 5;

/** Milliseconds at 1× before each event is shown. */
const BASE_MS: Record<PaiGowEvent['type'], number> = {
  RoundStarted: 150,
  PlayerCards: 380,
  DealerCards: 200,
  Decision: 120,
  PlayerSet: 360,
  DealerRevealed: 600,
  DealerSet: 700,
  Compared: 420,
  Settled: 300,
  BonusSettled: 260,
  RoundSettled: 380,
};
const RESULT_HOLD_MS = 1600;

const OUTCOME_LABEL: Record<PaiGowOutcome, string> = {
  win: 'won both hands, pays 0.95:1',
  push: 'one hand each, push',
  lose: 'lost both hands',
};

export interface HistoryEntry {
  round: number;
  high: string;
  low: string;
  outcome: PaiGowOutcome;
  net: Decimal;
}

function newSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

export class PaiGowGame {
  readonly seq = new Sequencer<PaiGowSet>();

  runSeed = $state(newSeed());
  round = $state(0);
  bet = $state(new Decimal(STARTING_BET));
  /** Side bets for the next hand, in dollars. */
  readonly side = new SideStakes(PG_BONUSES);
  /** Chips on the spots for the next hand. */
  readonly bets = new ChipBets(
    () => this.bet,
    (v) => (this.bet = v),
    this.side,
    () => this.bank,
    1,
  );
  /** Counts deals, so the table can throw each new hand in from the shoe. */
  deals = $state(0);
  /** The dealer card about to turn, for a moment of suspense. */
  dealerFocus = $state(-1);
  roundBet = $state(new Decimal(STARTING_BET));
  lastBet = $state(new Decimal(STARTING_BET));
  started = $state(false);
  gameOver = $state(false);
  autoPlay = $state(false);

  player = $state<(Card | null)[]>(Array(7).fill(null));
  dealer = $state<(Card | null)[]>(Array(7).fill(null));
  /** While setting: the cards picked for the low hand, by index. */
  picked = $state<number[]>([]);
  /** While setting: how the house way would do it. */
  suggestion = $state<PaiGowSet | null>(null);
  playerSet = $state<{ set: PaiGowSet; hands: SetHands } | null>(null);
  dealerSet = $state<{ set: PaiGowSet; hands: SetHands } | null>(null);
  winners = $state<{ high?: HandWinner; low?: HandWinner }>({});
  outcome = $state<PaiGowOutcome | null>(null);
  /** Side bets riding on this hand, in bets. */
  roundSide = $state<Record<string, number>>({});
  bonusResults = $state<Record<string, BonusResult>>({});
  net = $state<number | null>(null);
  breakdown = $state<BreakdownLine[]>([]);
  last = $state<{ lines: BreakdownLine[]; net: number } | null>(null);

  hands = $state(0);
  sessionNet = $state(new Decimal(0));
  biggestWin = $state(new Decimal(0));
  outcomes = $state<Record<PaiGowOutcome, number>>({ win: 0, push: 0, lose: 0 });
  history = $state<HistoryEntry[]>([]);

  get bank(): Decimal {
    return bankroll.balance;
  }

  /** The hand as the player has picked it so far: both halves scored, and whether it is legal. */
  get preview(): { hands: SetHands; legal: boolean } | null {
    if (this.picked.length !== 2 || this.player.some((c) => c === null)) return null;
    const cards = this.player as Card[];
    const set: PaiGowSet = { low: [this.picked[0]!, this.picked[1]!] };
    return { hands: applySet(cards, set), legal: isLegalSet(cards, set) };
  }

  get canSet(): boolean {
    return this.seq.awaiting === 'move' && !!this.preview?.legal;
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
    else if (this.seq.awaiting === 'deal' && this.bets.canDeal) this.seq.answer({ low: [0, 1] });
  }

  /** Tap a card: into the low hand, or back out. A third pick replaces the first. */
  toggle(index: number) {
    if (this.seq.awaiting !== 'move') return;
    if (this.picked.includes(index)) this.picked = this.picked.filter((i) => i !== index);
    else this.picked = [...this.picked, index].slice(-2);
    sfx.flip();
  }

  /** Pick the house way's low hand, for the player to look at or confirm. */
  showHouseWay() {
    if (this.seq.awaiting === 'move' && this.suggestion) this.picked = [...this.suggestion.low];
  }

  confirm() {
    if (this.canSet) this.seq.answer({ low: [this.picked[0]!, this.picked[1]!] });
  }

  deal() {
    if (this.seq.awaiting === 'deal' && this.bets.canDeal) this.seq.answer({ low: [0, 1] });
  }

  /** Space: set the picked hand if it is legal, otherwise the house way; or deal. */
  advance() {
    if (this.seq.awaiting === 'move') this.seq.answer(this.canSet ? { low: [this.picked[0]!, this.picked[1]!] } : this.suggestion!);
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
    this.bet = new Decimal(STARTING_BET);
    this.side.reset();
    this.hands = 0;
    this.outcomes = { win: 0, push: 0, lose: 0 };
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
    const bet = this.bet;
    const bonuses = this.side.units(bet);
    this.roundBet = bet;
    const seed = { run: this.runSeed, round: this.round };
    const run = (decide: (d: PaiGowDecision) => PaiGowSet, onEvent: (e: PaiGowEvent) => void) =>
      simulatePaiGowRound({ seed, bonuses, decide, onEvent });

    const choices: PaiGowSet[] = [];
    let shown = 0;
    for (;;) {
      const step = stepWithChoices(run, choices);
      if (!(await this.show(step.events.slice(shown)))) return false;
      shown = step.events.length;

      if (step.kind === 'done') {
        this.settle(step.result, bet);
        return true;
      }

      let choice: PaiGowSet | null = step.decision.suggestion;
      if (!this.autoPlay) {
        this.suggestion = step.decision.suggestion;
        this.picked = [];
        choice = await this.seq.ask('move');
        this.suggestion = null;
        this.picked = [];
      }
      if (choice === null) return false;
      choices.push(choice);
    }
  }

  private async show(events: PaiGowEvent[]): Promise<boolean> {
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
      if (this.seq.speed === 'smart' && (event.type === 'BonusSettled' || event.type === 'Settled')) ms *= 0.7;
      if (!(await this.seq.wait(ms))) return false;
      this.apply(event);
    }
    return true;
  }

  private apply(event: PaiGowEvent) {
    switch (event.type) {
      case 'RoundStarted':
        this.deals++;
        this.bets.touched = false;
        this.dealerFocus = -1;
        this.player = Array(7).fill(null);
        this.dealer = Array(7).fill(null);
        this.playerSet = null;
        this.dealerSet = null;
        this.winners = {};
        this.outcome = null;
        this.roundSide = event.bonuses;
        this.bonusResults = {};
        this.net = null;
        this.breakdown = [];
        break;
      case 'PlayerCards':
        this.player = [...event.cards];
        sfx.flip();
        break;
      case 'PlayerSet':
        this.playerSet = { set: event.set, hands: event.hands };
        sfx.chip();
        break;
      case 'DealerRevealed':
        this.dealer = [...event.cards];
        sfx.flip();
        break;
      case 'DealerSet':
        this.dealerSet = { set: event.set, hands: event.hands };
        break;
      case 'Compared':
        this.winners = { ...this.winners, [event.hand]: event.winner };
        if (event.winner === 'player') sfx.chip();
        break;
      case 'Settled':
        this.outcome = event.outcome;
        this.breakdown.push({ label: `Bet · ${OUTCOME_LABEL[event.outcome]}`, amount: event.net });
        break;
      case 'BonusSettled':
        this.bonusResults[event.result.id] = event.result;
        this.breakdown.push(bonusLine(PG_BONUSES, event.result));
        if (event.result.net > 0) sfx.chip();
        break;
      case 'RoundSettled':
        this.net = event.net;
        this.last = { lines: [...this.breakdown], net: event.net };
        if (event.net >= 5) sfx.bigWin();
        else if (event.net > 0) sfx.win();
        else if (event.net < 0) sfx.lose();
        break;
      case 'DealerCards':
      case 'Decision':
        break;
    }
  }

  private settle(result: PaiGowRoundResult, bet: Decimal) {
    const net = bet.mul(result.net);
    this.lastBet = bet;
    bankroll.settle(net);
    this.sessionNet = this.sessionNet.add(net);
    if (net.gt(this.biggestWin)) this.biggestWin = net;
    this.outcomes = { ...this.outcomes, [result.outcome]: this.outcomes[result.outcome] + 1 };
    this.hands++;
    this.round++;
    const entry: HistoryEntry = {
      round: this.round,
      high: pgHandName(result.playerSet.highScore),
      low: pgLowName(result.playerSet.lowScore),
      outcome: result.outcome,
      net,
    };
    this.history = [entry, ...this.history].slice(0, 12);
    if (this.bank.lte(0)) this.gameOver = true;
    else this.bets.fitToBank();
  }
}
