import {
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
import { Clock } from '../../lib/clock';
import { Decimal } from '../../lib/money';
import { sfx } from '../../lib/sound';
import { BjTableView } from './table.svelte';

const STARTING_BET = 5;

export type SpeedMode = 'smart' | '1x' | '2x' | '5x';
const FIXED: Record<Exclude<SpeedMode, 'smart'>, number> = { '1x': 1, '2x': 2, '5x': 5 };

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
  private readonly clock = new Clock();

  runSeed = $state(newSeed());
  round = $state(0);
  bet = $state(new Decimal(STARTING_BET));
  /** The bet the round on the table was dealt at. */
  roundBet = $state(new Decimal(STARTING_BET));
  lastBet = $state(new Decimal(STARTING_BET));
  started = $state(false);
  paused = $state(false);
  gameOver = $state(false);
  speed = $state<SpeedMode>('smart');
  autoPlay = $state(false);
  /** What the game is waiting on the player for, if anything. */
  awaiting = $state<'move' | 'deal' | null>(null);
  decision = $state<Decision | null>(null);

  hands = $state(0);
  sessionNet = $state(new Decimal(0));
  biggestWin = $state(new Decimal(0));
  blackjacks = $state(0);
  freeWins = $state(new Decimal(0));
  push22s = $state(0);
  history = $state<HistoryEntry[]>([]);

  private resolveMove: ((move: Move | null) => void) | null = null;
  private disposed = false;

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
    if (this.started || this.disposed) return;
    this.started = true;
    void this.loop();
  }

  togglePause() {
    this.paused = !this.paused;
    this.clock.paused = this.paused;
  }

  setAutoPlay(on: boolean) {
    this.autoPlay = on;
    if (!on) return;
    if (this.awaiting === 'move') this.answer(this.decision!.suggestion);
    else if (this.awaiting === 'deal') this.answer('stand');
  }

  /** The player's own choice; must be one the rules allow. */
  choose(move: Move) {
    if (this.awaiting === 'move') this.answer(move);
  }

  deal() {
    if (this.awaiting === 'deal') this.answer('stand');
  }

  /** Space: take the suggested move, or deal the next hand. */
  advance() {
    if (this.awaiting === 'move') this.answer(this.decision!.suggestion);
    else this.deal();
  }

  changeBet(factor: number) {
    const next = this.bet.mul(factor).floor().max(1);
    this.bet = next.gt(this.bank) ? this.bank.floor().max(1) : next;
  }

  dispose() {
    this.disposed = true;
    this.started = false;
    this.answer(null);
    this.clock.reset();
  }

  restart() {
    this.answer(null);
    this.clock.reset();
    this.runSeed = newSeed();
    this.round = 0;
    bankroll.buyIn();
    this.bet = new Decimal(STARTING_BET);
    this.hands = 0;
    this.sessionNet = new Decimal(0);
    this.biggestWin = new Decimal(0);
    this.blackjacks = 0;
    this.freeWins = new Decimal(0);
    this.push22s = 0;
    this.history = [];
    this.view.last = null;
    this.gameOver = false;
    this.paused = false;
    this.started = false;
    this.start();
  }

  private answer(move: Move | null) {
    const resolve = this.resolveMove;
    this.resolveMove = null;
    this.awaiting = null;
    this.decision = null;
    resolve?.(move);
  }

  private waitFor(kind: 'move' | 'deal', decision: Decision | null = null): Promise<Move | null> {
    this.awaiting = kind;
    this.decision = decision;
    return new Promise((resolve) => (this.resolveMove = resolve));
  }

  private async loop() {
    while (this.started && !this.gameOver && !this.disposed) {
      if (!(await this.playRound())) return;
      if (this.gameOver) return;
      const ok = this.autoPlay
        ? await this.clock.wait(RESULT_HOLD_MS / (this.speed === 'smart' ? 1 : FIXED[this.speed]))
        : (await this.waitFor('deal')) !== null;
      if (!ok) return;
    }
  }

  /** Plays one round; false if the game was reset part-way through. */
  private async playRound(): Promise<boolean> {
    const bet = this.bet;
    this.roundBet = bet;
    const input = { tables: this.tables, rules: this.rules, seed: { run: this.runSeed, round: this.round } };
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

      const move = this.autoPlay ? step.decision.suggestion : await this.waitFor('move', step.decision);
      if (move === null) return false;
      moves.push(move);
    }
  }

  /** Plays events out at the current speed. False if the game was reset. */
  private async show(events: BjEvent[]): Promise<boolean> {
    for (const event of events) {
      if (!(await this.clock.wait(this.delay(event)))) return false;
      this.view.apply(event);
      this.playSound(event);
    }
    return true;
  }

  private delay(event: BjEvent): number {
    const base = BASE_MS[event.type];
    if (this.speed !== 'smart') return base / FIXED[this.speed];
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
      case 'DealerDrew': {
        const total = this.view.dealerTotal?.total ?? 0;
        if (total >= 17 && this.speed === 'smart') sfx.tension();
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
    else if (this.bet.gt(this.bank)) this.bet = this.bank.floor().max(1);
  }
}

function describe(cards: number, total: number): string {
  return total > 21 ? 'bust' : `${total}${cards === 2 ? '' : `·${cards}`}`;
}
