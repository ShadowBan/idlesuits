import {
  BJ_BONUSES,
  cutCardOut,
  FREE_BET_RULES,
  handTotal,
  shuffleShoe,
  solveStrategy,
  stepRound,
  type BjChoice,
  type BjEvent,
  type BjRoundResult,
  type BjRules,
  type Decision,
  type RoundReport,
  type Shoe,
  type StrategyTables,
} from '@idlesuits/sim';
import { bankroll } from '../../lib/casino.svelte';
import { Decimal } from '../../lib/money';
import { meta } from '../../lib/meta.svelte';
import { load, saveSoon } from '../../lib/save';
import { mainBet, outcomeOf, sideBets } from '../../lib/report';
import { Sequencer } from '../../lib/sequencer.svelte';
import { SideStakes } from '../../lib/sidebets.svelte';
import { sfx } from '../../lib/sound';
import { ChipBets } from '../../lib/stakes.svelte';
import { BjTableView } from './table.svelte';

const STARTING_BET = 5;

/** Milliseconds at 1× before each event is shown. */
const BASE_MS: Record<BjEvent['type'], number> = {
  RoundStarted: 150,
  CardDealt: 300,
  DealerPeeked: 260,
  HandFocused: 200,
  MoveMade: 320,
  HandStood: 180,
  HoleCardRevealed: 520,
  DealerDrew: 420,
  DealerDone: 260,
  HandSettled: 260,
  BonusSettled: 320,
  RoundSettled: 420,
  InsuranceDecided: 260,
  InsuranceSettled: 320,
};

/** The dealer breaking in a new shoe. */
const SHUFFLE_MS = 1800;

/** How long a finished round stays on the table. */
const RESULT_HOLD_MS = 1500;

export interface HistoryEntry {
  round: number;
  player: string;
  dealer: string;
  outcome: string;
  net: Decimal;
}

function newSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

export class BjGame {
  readonly rules: BjRules = FREE_BET_RULES;
  readonly tables: StrategyTables = solveStrategy(FREE_BET_RULES);
  readonly view = new BjTableView();
  readonly seq = new Sequencer<BjChoice>();
  /** The shoe being dealt, down to its cut card. Kept across rounds and saved, as a real table's shoe is. */
  private shoe: Shoe;
  private shoeSeed: string;
  private shoeNumber: number;
  /** Decks in the shoe being dealt: six, fewer with the Thin Shoe charm, changed only at a shuffle. */
  private shoeDecks: number;
  /** What the table shows of the shoe: cards left, where the cut card sits, the discards. */
  shoeView = $state({ size: 0, next: 0, cut: 0 });
  /** The dealer is shuffling a new shoe. */
  shuffling = $state(false);

  runSeed = $state(newSeed());
  round = $state(0);
  bet = $state(new Decimal(STARTING_BET));
  /** Side bets for the next hand, in dollars. */
  readonly side = new SideStakes(BJ_BONUSES);
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
  /** Side bets riding on the round on the table, in base bets. */
  roundSide = $state<Record<string, number>>({});
  /** The bet the round on the table was dealt at. */
  roundBet = $state(new Decimal(STARTING_BET));
  lastBet = $state(new Decimal(STARTING_BET));
  started = $state(false);
  gameOver = $state(false);
  autoPlay = $state(false);
  /** The decision the player is being asked to make, if any. */
  decision = $state<Decision | null>(null);

  hands = $state(0);
  sessionNet = $state(new Decimal(0));
  biggestWin = $state(new Decimal(0));
  blackjacks = $state(0);
  freeWins = $state(new Decimal(0));
  push22s = $state(0);
  history = $state<HistoryEntry[]>([]);

  constructor() {
    // Sit back down and the chips and the speed are as you left them.
    this.bets.remember('blackjack');
    this.seq.remember('blackjack');
    const saved = load<{ seed: string; number: number; next: number; decks?: number } | null>('shoe.blackjack', null);
    this.shoeSeed = saved?.seed ?? newSeed();
    this.shoeNumber = saved?.number ?? 0;
    this.shoeDecks = saved?.decks ?? this.decksWanted();
    this.shoe = shuffleShoe(this.shoeDecks, this.shoeSeed, this.shoeNumber);
    if (saved && saved.next > this.shoe.next && saved.next < this.shoe.cards.length) this.shoe.next = saved.next;
    this.refreshShoe();
  }

  private refreshShoe() {
    this.shoeView = { size: this.shoe.cards.length, next: this.shoe.next, cut: this.shoe.cut };
    saveSoon('shoe.blackjack', () => ({
      seed: this.shoeSeed,
      number: this.shoeNumber,
      next: this.shoe.next,
      decks: this.shoeDecks,
    }));
  }

  /** The decks the next shoe should hold. */
  private decksWanted(): number {
    return Math.max(1, this.rules.decks - meta.fewerDecks);
  }

  /** Insurance costs half the bet on top of everything else down; the bankroll must cover it. */
  canInsure(): boolean {
    return this.bank.gte(this.roundBet.mul(1.5).add(this.side.total));
  }

  /** Too little left to deal a hand at this table, even at the smallest bet. */
  get broke(): boolean {
    return this.bank.lt(this.bets.minimum);
  }

  get bank(): Decimal {
    return bankroll.balance;
  }

  /** Doubling is free on a two-card hard 9, 10 or 11. */
  freeDoubleReady(): boolean {
    const hand = this.decision?.hand;
    if (!hand || hand.cards.length !== 2) return false;
    const total = handTotal(hand.cards);
    return !total.soft && this.rules.freeDoubleTotals.includes(total.total);
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
    if (this.seq.awaiting === 'move') this.seq.answer(this.decision!.suggestion);
    else if (this.seq.awaiting === 'deal' && this.bets.canDeal) this.seq.answer('stand');
  }

  /** The player's own choice; must be one the rules allow. */
  choose(move: BjChoice) {
    if (this.seq.awaiting === 'move') this.seq.answer(move);
  }

  deal() {
    if (this.seq.awaiting === 'deal' && this.bets.canDeal) this.seq.answer('stand');
  }

  /** Space: take the suggested move, or deal the next hand. */
  advance() {
    if (this.seq.awaiting === 'move') this.seq.answer(this.decision!.suggestion);
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
    // A buy-back starts from the table's opening bets, with auto play off.
    this.bets.save();
    this.autoPlay = false;
    this.hands = 0;
    this.sessionNet = new Decimal(0);
    this.biggestWin = new Decimal(0);
    this.blackjacks = 0;
    this.freeWins = new Decimal(0);
    this.push22s = 0;
    this.history = [];
    this.view.last = null;
    this.gameOver = false;
    this.started = false;
    this.start();
  }

  /** Bets go down before every hand; auto play deals on its own once there is a bet. */
  private async loop() {
    while (this.started && !this.gameOver && !this.seq.disposed) {
      const auto = this.autoPlay && this.bets.canDeal && this.round > 0;
      const ok = auto ? await this.seq.wait(RESULT_HOLD_MS) : (await this.seq.ask('deal')) !== null;
      if (!ok) return;
      if (!this.bets.canDeal) continue;
      if (!(await this.playRound())) return;
    }
  }

  /** Plays one round; false if the game was reset part-way through. */
  private async playRound(): Promise<boolean> {
    // The cut card came out last round: the dealer shuffles before dealing on.
    if (cutCardOut(this.shoe)) {
      this.shuffling = true;
      sfx.shuffle();
      const ok = await this.seq.wait(SHUFFLE_MS);
      this.shoeDecks = this.decksWanted();
      this.shoe = shuffleShoe(this.shoeDecks, this.shoeSeed, ++this.shoeNumber);
      this.refreshShoe();
      this.shuffling = false;
      if (!ok) return false;
    }
    const bet = this.bet;
    const bonuses = this.side.units(bet);
    this.roundBet = bet;
    this.roundSide = bonuses;
    const seed = { run: this.runSeed, round: this.round };
    const input = { tables: this.tables, rules: this.rules, seed, bonuses, shoe: this.shoe };
    const moves: BjChoice[] = [];
    let shown = 0;

    for (;;) {
      const step = stepRound(input, moves);
      // The prefix is identical every replay, so only the new events are animated.
      if (!(await this.show(step.events.slice(shown)))) return false;
      shown = step.events.length;

      if (step.kind === 'done') {
        this.shoe.next += step.result.cardsUsed;
        this.refreshShoe();
        this.settle(step.result, bet);
        return true;
      }

      let move: BjChoice | null = step.decision.suggestion;
      // Insurance the bankroll can't cover is never offered as a choice.
      if (step.decision.kind === 'insurance' && !this.canInsure()) move = 'noInsurance';
      else if (!this.autoPlay) {
        this.decision = step.decision;
        move = await this.seq.ask('move');
        this.decision = null;
      }
      if (move === null) return false;
      moves.push(move);
    }
  }

  /** Plays events out at the current speed. False if the game was reset. */
  private async show(events: BjEvent[]): Promise<boolean> {
    for (const event of events) {
      if (!(await this.seq.wait(this.delay(event)))) return false;
      if (event.type === 'RoundStarted') {
        this.deals++;
        this.bets.touched = false;
      }
      this.view.apply(event);
      // The shoe empties card by card as the table sees them dealt.
      if (event.type === 'CardDealt') this.shoeView.next++;
      this.playSound(event);
    }
    return true;
  }

  private delay(event: BjEvent): number {
    const base = BASE_MS[event.type];
    if (this.seq.speed !== 'smart') return base;
    // Smart pacing: hurry the deal, linger where the round is decided.
    if (event.type === 'CardDealt' && this.view.hands[0]!.cards.length < 2) return base * 0.5;
    if (event.type === 'HoleCardRevealed' || event.type === 'DealerDrew') {
      const total = this.view.dealerTotal?.total ?? 0;
      return base * (total >= 15 ? 1.5 : 1);
    }
    if (event.type === 'HandSettled') return base * (Math.abs(event.net) >= 2 ? 1.6 : 0.8);
    return base;
  }

  private playSound(event: BjEvent) {
    switch (event.type) {
      case 'CardDealt':
        sfx.flip();
        break;
      case 'MoveMade':
        if (event.move === 'double' || event.move === 'split') sfx.chip();
        break;
      case 'HandSettled':
        if (event.outcome === 'blackjack') sfx.bigWin();
        else if (event.net > 0) sfx.win();
        else if (event.net < 0) sfx.lose();
        break;
      case 'BonusSettled':
        if (event.result.net > 0) sfx.chip();
        break;
      case 'DealerDrew': {
        const total = this.view.dealerTotal?.total ?? 0;
        if (total >= 17 && this.seq.speed === 'smart') sfx.tension();
        break;
      }
    }
  }

  private settle(result: BjRoundResult, bet: Decimal) {
    const mainNet = result.hands.reduce((sum, h) => sum + (h.net ?? 0), 0);
    const report: RoundReport = {
      game: 'blackjack',
      seed: { run: this.runSeed, round: this.round },
      bets: [
        // The house's free money counts toward the odds a hand paid, so a free double still pays 1:1.
        ...result.hands.flatMap((h) => mainBet(h.bet + h.free, h.net ?? 0)),
        ...sideBets(result.bonuses, this.roundSide),
        ...(result.insurance === null ? [] : [{ kind: 'side' as const, stake: 0.5, net: result.insurance }]),
      ],
      outcome: outcomeOf(false, mainNet),
      blackjack: result.hands.some((h) => h.outcome === 'blackjack'),
    };
    // Charms act on the settled hand; the bankroll is paid the hand and whatever they add.
    const charms = meta.settleRound(report, bet, result.net);
    const units = result.net + charms.extra;
    if (charms.lines.length) {
      this.view.net = units;
      this.view.last = { lines: [...(this.view.last?.lines ?? []), ...charms.lines], net: units };
    }
    const net = bet.mul(units);
    this.lastBet = bet;
    this.sessionNet = this.sessionNet.add(net);
    if (net.gt(this.biggestWin)) this.biggestWin = net;
    this.hands += result.hands.length;
    this.round++;

    for (const hand of result.hands) {
      if (hand.outcome === 'blackjack') this.blackjacks++;
      if (hand.outcome === 'push22') this.push22s++;
      if (hand.free > 0 && (hand.net ?? 0) > 0) this.freeWins = this.freeWins.add(bet.mul(hand.free));
    }

    const first = result.hands[0]!;
    const entry: HistoryEntry = {
      round: this.round,
      player: result.hands.map((h) => describe(h.cards.length, handTotal(h.cards).total)).join(' / '),
      dealer: result.dealerBlackjack ? 'BJ' : String(result.dealerTotal.total),
      outcome: result.hands.length > 1 ? 'split' : (first.outcome ?? ''),
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

function describe(cards: number, total: number): string {
  return total > 21 ? 'bust' : `${total}${cards === 2 ? '' : `·${cards}`}`;
}
