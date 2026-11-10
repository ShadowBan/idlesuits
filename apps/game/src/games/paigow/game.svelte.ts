import {
  BLIND,
  PAI_GOW_RULES,
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
  pgCategoryOf,
  type RoundReport,
} from '@idlesuits/sim';
import type { TableSettled } from '@idlesuits/engine';
import { BlindHands } from '../../lib/blind.svelte';
import { player } from '../../lib/player.svelte';
import { landSettled, playTable, sidesInDollars } from '../../lib/table.svelte';
import type { BreakdownLine } from '../../lib/breakdown';
import { bankroll } from '../../lib/casino.svelte';
import { Decimal } from '../../lib/money';
import { meta } from '../../lib/meta.svelte';
import { mainBet, outcomeOf, sideBets } from '../../lib/report';
import { Sequencer } from '../../lib/sequencer.svelte';
import { bonusLine, SideStakes } from '../../lib/sidebets.svelte';
import { ChipBets } from '../../lib/stakes.svelte';
import { sfx } from '../../lib/sound';
import { tuning } from '../../lib/tuning.svelte';

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
  /** The rules as designed, with anything the admin panel has changed. */
  get rules() {
    return tuning.rules('paigow', PAI_GOW_RULES);
  }

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
  /** Why the last hand couldn't be dealt or played on, for a moment on screen. */
  error = $state<string | null>(null);

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
  /** Hands the Lucky Seat deals blind beside the player's, played all in. */
  readonly blind = new BlindHands('paigow');
  bonusResults = $state<Record<string, BonusResult>>({});
  net = $state<number | null>(null);
  breakdown = $state<BreakdownLine[]>([]);
  last = $state<{ lines: BreakdownLine[]; net: number } | null>(null);

  hands = $state(0);
  sessionNet = $state(new Decimal(0));
  biggestWin = $state(new Decimal(0));
  outcomes = $state<Record<PaiGowOutcome, number>>({ win: 0, push: 0, lose: 0 });
  history = $state<HistoryEntry[]>([]);

  constructor() {
    // Sit back down and the chips and the speed are as you left them.
    this.bets.remember('paigow');
    this.seq.remember('paigow');
  }

  /** Too little left to deal a hand at this table, even at the smallest bet. */
  get broke(): boolean {
    return this.bank.lt(this.bets.minimum);
  }

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
    // Sitting down with too little to bet goes straight to the buy-back.
    if (this.broke) {
      // Losing it all is the penalty for running unattended: auto play stops until it's pressed again.
      this.gameOver = true;
      this.autoPlay = false;
    }
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
    // Anything still held back for this table's show is shown as it is.
    player.releaseAll();
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
    // A buy-back starts from the table's opening bets, with auto play off.
    this.bets.save();
    this.autoPlay = false;
    this.hands = 0;
    this.outcomes = { win: 0, push: 0, lose: 0 };
    this.sessionNet = new Decimal(0);
    this.biggestWin = new Decimal(0);
    this.history = [];
    this.last = null;
    this.blind.clear();
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

  /**
   * Plays a hand through the engine (on the server, for a member), or a few
   * under auto play: the bets go down, each decision goes to the engine, and
   * the felt shows what comes back. A hand left mid-way picks up where it was.
   */
  private async playRound(): Promise<boolean> {
    return playTable<PaiGowDecision, PaiGowSet>({
      game: 'paigow',
      request: () => ({ bet: this.bet.toString(), sides: sidesInDollars(this.side.units(this.bet), this.bet), blind: this.blind.request() }),
      autoPlay: () => this.autoPlay,
      wait: (ms) => this.seq.wait(ms),
      between: RESULT_HOLD_MS,
      start: (play, unit) => {
        this.roundBet = unit;
        this.blind.fromDeal(play.blind, Number(play.info.holeCards) || 0);
      },
      ready: (play, unit) => void this.blind.fromSettled(play.settled!.blind, unit),
      show: (events) => this.show(events as PaiGowEvent[]),
      decide: async (decision) => {
        const suggestion = decision.suggestion;
        if (this.autoPlay) return suggestion;
        this.suggestion = suggestion;
        this.picked = [];
        const choice = await this.seq.ask('move');
        this.suggestion = null;
        this.picked = [];
        return choice;
      },
      settled: (play, hold, unit) => this.settle(play.result as PaiGowRoundResult, play.settled!, hold, unit),
      failed: (error) => {
        this.error = error;
        this.autoPlay = false;
      },
    });
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
        this.blind.reveal();
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
        this.blind.showResults();
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

  /** What the casino is told about one settled hand, for charms and Tokens. */

  private settle(result: PaiGowRoundResult, settled: TableSettled, hold: number | null, bet: Decimal) {
    const blind = this.blind.fromSettled(settled.blind, bet);
    // Charms act on the settled hand; the bankroll is paid the hand and whatever they add.
    // The hand as the engine settled it, charms and all, shows now that the felt has dealt it out.
    const charms = landSettled(settled, hold);
    const units = charms.units;
    if (charms.lines.length) this.net = units;
    if (charms.lines.length || blind.hands) {
      this.last = { lines: [...(this.last?.lines ?? []), ...charms.lines, ...blind.lines], net: units + blind.units };
    }
    const net = bet.mul(units);
    this.lastBet = bet;
    this.sessionNet = this.sessionNet.add(net).add(blind.money);
    if (net.gt(this.biggestWin)) this.biggestWin = net;
    this.outcomes = { ...this.outcomes, [result.outcome]: this.outcomes[result.outcome] + 1 };
    this.hands += 1 + blind.hands;
    this.round++;
    const entry: HistoryEntry = {
      round: this.round,
      high: pgHandName(result.playerSet.highScore),
      low: pgLowName(result.playerSet.lowScore),
      outcome: result.outcome,
      net,
    };
    this.history = [entry, ...this.history].slice(0, 12);
    if (this.broke) {
      // Losing it all is the penalty for running unattended: auto play stops until it's pressed again.
      this.gameOver = true;
      this.autoPlay = false;
    }
    else this.bets.fit();
  }
}
