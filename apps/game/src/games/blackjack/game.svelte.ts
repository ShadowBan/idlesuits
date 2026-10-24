import {
  BJ_BONUSES,
  FREE_BET_RULES,
  handTotal,
  solveStrategy,
  stepRound,
  type BjEvent,
  type BjRoundResult,
  type BjRules,
  type Decision,
  type Move,
  type StrategyTables,
} from '@idlesuits/sim';
import { bankroll } from '../../lib/casino.svelte';
import { Decimal } from '../../lib/money';
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
};

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
  readonly seq = new Sequencer<Move>();

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
    void this.loop();
  }

  setAutoPlay(on: boolean) {
    this.autoPlay = on;
    if (!on) return;
    if (this.seq.awaiting === 'move') this.seq.answer(this.decision!.suggestion);
    else if (this.seq.awaiting === 'deal' && this.bets.canDeal) this.seq.answer('stand');
  }

  /** The player's own choice; must be one the rules allow. */
  choose(move: Move) {
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
    const bet = this.bet;
    const bonuses = this.side.units(bet);
    this.roundBet = bet;
    this.roundSide = bonuses;
    const seed = { run: this.runSeed, round: this.round };
    const input = { tables: this.tables, rules: this.rules, seed, bonuses };
    const moves: Move[] = [];
    let shown = 0;

    for (;;) {
      const step = stepRound(input, moves);
      // The prefix is identical every replay, so only the new events are animated.
      if (!(await this.show(step.events.slice(shown)))) return false;
      shown = step.events.length;

      if (step.kind === 'done') {
        this.settle(step.result, bet);
        return true;
      }

      let move: Move | null = step.decision.suggestion;
      if (!this.autoPlay) {
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
    const net = bet.mul(result.net);
    this.lastBet = bet;
    bankroll.settle(net);
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

    if (this.bank.lte(0)) this.gameOver = true;
    else this.bets.fitToBank();
  }
}

function describe(cards: number, total: number): string {
  return total > 21 ? 'bust' : `${total}${cards === 2 ? '' : `·${cards}`}`;
}
