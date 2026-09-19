import type { BatchStats } from '@idlesuits/balance';
import {
  buildShoe,
  DEFAULT_RULES,
  maxRaise,
  simulateRound,
  standardDeck,
  type Card,
  type RaisePolicy,
  type SeatConfig,
  type Suit,
  type TableRules,
} from '@idlesuits/sim';
import { Clock } from './clock';
import { beatDelay, direct, resultHold, type Beat, type Drama, type SpeedMode } from './director';
import { Decimal } from './money';
import { sfx } from './sound';
import { TableView } from './table.svelte';

const STARTING_BANK = 500;
const STARTING_ANTE = 5;
const ESTIMATE_HANDS = 40_000;

/** Flush sizes the raise plan has a row for; the last row covers that size and up. */
export const PLAN_SIZES = [2, 3, 4, 5, 6] as const;

export interface RaisePlan {
  /** Flush size → raise in antes (0 = fold). */
  raises: Record<number, number>;
  /** 3-card flushes fold unless 10-8-6 or better. */
  threeCardMinimum: boolean;
}

/** Matches optimal play for the base game. */
const DEFAULT_PLAN: RaisePlan = { raises: { 2: 0, 3: 1, 4: 1, 5: 2, 6: 3 }, threeCardMinimum: true };

export interface Estimate {
  /** Expected result per hand, in dollars at the current bets. */
  perHand: Decimal;
  /** As a fraction of everything wagered per hand on average. */
  perWagered: number;
}

export interface HistoryEntry {
  round: number;
  size: number;
  suit: Suit;
  outcome: string;
  net: Decimal;
}

function newSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

export class Game {
  readonly rules: TableRules = DEFAULT_RULES;
  readonly shoe: Card[] = buildShoe(standardDeck('player'));
  readonly view = new TableView(this.rules.sideBets);
  private readonly clock = new Clock();

  runSeed = $state(newSeed());
  round = $state(0);
  bank = $state(new Decimal(STARTING_BANK));
  ante = $state(new Decimal(STARTING_ANTE));
  /** The ante the round on the table was dealt at; `ante` only applies to the next round. */
  roundAnte = $state(new Decimal(STARTING_ANTE));
  /** The ante of the last finished round, for its breakdown. */
  lastAnte = $state(new Decimal(STARTING_ANTE));
  started = $state(false);
  paused = $state(false);
  gameOver = $state(false);
  speed = $state<SpeedMode>('smart');
  /** Dollar stake per side bet; zero means not claimed. Independent of the ante. */
  sideStakes = $state<Record<string, Decimal>>({ flushRush: new Decimal(STARTING_ANTE), superFlushRush: new Decimal(0) });
  raisePlan = $state<RaisePlan>(structuredClone(DEFAULT_PLAN));
  estimate = $state<Estimate | null>(null);
  /** Dev toggle: the dealer takes any side bet the player leaves open. */
  dealerClaims = $state(false);

  hands = $state(0);
  sessionNet = $state(new Decimal(0));
  biggestWin = $state(new Decimal(0));
  flushCounts = $state<Record<number, number>>({});
  history = $state<HistoryEntry[]>([]);

  /** Off: the player deals each hand and flips their own cards. */
  autoPlay = $state(false);
  /** What the game is waiting on the player for, if anything. */
  awaiting = $state<'flip' | 'bet' | 'deal' | null>(null);
  /** While awaiting 'bet': the most the player may raise, and what their plan would do. */
  betChoice = $state<{ cap: number; suggested: number } | null>(null);
  private resolveWait: ((slot: number) => void) | null = null;
  /** Set by "Flip all": the rest of this hand's cards reveal on their own. */
  private flipRest = false;
  private disposed = false;
  private estimator: Worker | null = null;
  private estimateId = 0;
  private pendingEstimate: { id: number; ante: Decimal } | null = null;

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
    if (this.awaiting === 'flip') this.answer(this.nextFaceDown());
    else if (this.awaiting === 'bet') this.answer(this.betChoice!.suggested);
    else this.answer(0);
  }

  /** Player's own raise decision in manual play; 0 folds. */
  chooseRaise(raise: number) {
    if (this.awaiting === 'bet' && raise >= 0 && raise <= this.betChoice!.cap) this.answer(raise);
  }

  /** Player clicked a face-down card of theirs. */
  flip(slot: number) {
    if (this.awaiting === 'flip' && this.view.player.cards[slot] === null) this.answer(slot);
  }

  flipAll() {
    if (this.awaiting !== 'flip') return;
    this.flipRest = true;
    this.answer(this.nextFaceDown());
  }

  deal() {
    if (this.awaiting === 'deal') this.answer(0);
  }

  /** Space/Enter: flip the next card, take the plan's bet, or deal. */
  advance() {
    if (this.awaiting === 'flip') this.flip(this.nextFaceDown());
    else if (this.awaiting === 'bet') this.chooseRaise(this.betChoice!.suggested);
    else this.deal();
  }

  private nextFaceDown(): number {
    return this.view.player.cards.findIndex((c) => c === null);
  }

  private waitFor(kind: 'flip' | 'bet' | 'deal'): Promise<number> {
    this.awaiting = kind;
    return new Promise((resolve) => (this.resolveWait = resolve));
  }

  private answer(value: number) {
    const resolve = this.resolveWait;
    this.resolveWait = null;
    this.awaiting = null;
    resolve?.(value);
  }

  /**
   * Stops the loop for good. Without this, a hot reload (or anything that
   * remounts the app) leaves the old game playing sounds with no table.
   */
  dispose() {
    this.disposed = true;
    this.estimator?.terminate();
    this.started = false;
    this.answer(-1);
    this.clock.reset();
  }

  restart() {
    this.answer(-1);
    this.clock.reset();
    this.runSeed = newSeed();
    this.round = 0;
    this.bank = new Decimal(STARTING_BANK);
    this.ante = new Decimal(STARTING_ANTE);
    this.sideStakes = { flushRush: new Decimal(STARTING_ANTE), superFlushRush: new Decimal(0) };
    this.hands = 0;
    this.sessionNet = new Decimal(0);
    this.biggestWin = new Decimal(0);
    this.flushCounts = {};
    this.history = [];
    this.view.last = null;
    this.gameOver = false;
    this.paused = false;
    this.started = false;
    this.view.apply({ type: 'RoundStarted', round: 0, shoeSize: this.shoe.length, seats: 1 });
    this.start();
  }

  changeAnte(factor: number) {
    const next = this.ante.mul(factor).floor().max(1);
    this.ante = next.gt(this.bank) ? this.bank.floor().max(1) : next;
  }

  /** Halve or double a side bet. Below $1 turns it off; raising from off starts at the ante. */
  changeSideStake(id: string, factor: number) {
    const current = this.sideStakes[id] ?? new Decimal(0);
    let next = current.eq(0) ? (factor > 1 ? this.ante : current) : current.mul(factor).floor();
    if (next.lt(1)) next = new Decimal(0);
    this.sideStakes[id] = next.gt(this.bank) ? this.bank.floor() : next;
  }

  setPlanRaise(size: number, raise: number) {
    this.raisePlan.raises[size] = raise;
  }

  /** The most a single hand can cost from the main bet and your own side bets. */
  get maxAtRisk(): Decimal {
    // In manual play the player may raise to the table maximum whatever the plan says.
    const topRaise = this.autoPlay ? Math.max(...Object.values(this.raisePlan.raises)) : 3;
    return Object.values(this.sideStakes).reduce((sum, s) => sum.add(s), this.ante.mul(1 + topRaise));
  }

  planPolicy(): RaisePolicy {
    return {
      kind: 'bySize',
      raises: { ...this.raisePlan.raises },
      minRanks: this.raisePlan.threeCardMinimum ? [10, 8, 6] : undefined,
    };
  }

  private tableRules(): TableRules {
    return { ...this.rules, unclaimedOwner: this.dealerClaims ? 'dealer' : 'none' };
  }

  /** The seat as the simulator sees it: side-bet stakes are expressed in antes. */
  private seat(raisePolicy: RaisePolicy, ante: Decimal): SeatConfig {
    const sideBets: Record<string, number> = {};
    for (const [id, stake] of Object.entries(this.sideStakes)) {
      if (stake.gt(0)) sideBets[id] = stake.div(ante).toNumber();
    }
    return { raisePolicy, sideBets };
  }

  /**
   * Simulates the current bets on many hands (in a worker) to show what they
   * are worth. A fixed seed means two settings are compared on the same hands.
   */
  refreshEstimate() {
    if (this.disposed) return;
    this.estimator ??= this.createEstimator();
    const ante = this.ante;
    const id = ++this.estimateId;
    const input = {
      shoe: this.shoe,
      seat: this.seat(this.planPolicy(), ante),
      rules: this.tableRules(),
      runSeed: 'estimate',
      dealerId: 'standard',
      hands: ESTIMATE_HANDS,
    };
    this.pendingEstimate = { id, ante };
    this.estimator.postMessage({ id, input: $state.snapshot(input) });
  }

  private createEstimator(): Worker {
    const worker = new Worker(new URL('./estimate.worker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (e: MessageEvent<{ id: number; stats: BatchStats }>) => {
      const pending = this.pendingEstimate;
      if (!pending || e.data.id !== pending.id) return; // a newer request is on its way
      const { stats } = e.data;
      const sideStaked = Object.values(stats.sideBets).reduce((sum, b) => sum + (b.owner === 'player' ? b.staked : 0), 0);
      this.estimate = {
        perHand: pending.ante.mul(stats.net / stats.hands),
        perWagered: stats.net / (stats.mainWagered + sideStaked),
      };
    });
    return worker;
  }

  private async loop() {
    while (this.started && !this.gameOver && !this.disposed) {
      const drama = await this.playRound();
      if (drama === null || this.gameOver) return;
      const ok = this.autoPlay ? await this.clock.wait(resultHold(drama, this.speed)) : (await this.waitFor('deal')) >= 0;
      if (!ok) return;
    }
  }

  /** Plays one round; returns how dramatic its result was, or null if the game was reset mid-round. */
  private async playRound(): Promise<Drama | null> {
    const rules = this.tableRules();
    const ante = this.ante;
    // Bets are fixed when the hand is dealt; later edits apply to the next hand.
    const seatConfig = this.seat(this.planPolicy(), ante);
    const simulate = (raisePolicy: RaisePolicy) =>
      simulateRound({
        shoe: this.shoe,
        seats: [{ ...seatConfig, raisePolicy }],
        rules,
        seed: { run: this.runSeed, dealerId: 'standard', round: this.round },
        recordEvents: true,
      });
    let result = simulate(seatConfig.raisePolicy);
    this.roundAnte = ante;
    this.flipRest = false;

    let beats = direct(result);
    for (let i = 0; i < beats.length; i++) {
      const beat = beats[i]!;
      const { event, drama } = beat;

      if (event.type === 'RaiseDecided' && event.seat === 0 && !this.autoPlay) {
        this.betChoice = { cap: maxRaise(rules.raiseCaps, this.view.player.eval!.size), suggested: event.raise };
        const raise = await this.waitFor('bet');
        this.betChoice = null;
        if (raise < 0) return null;
        if (raise !== event.raise) {
          // Same seed, so the same cards; everything up to this beat is unchanged.
          result = simulate({ kind: 'fixed', raise });
          beats = direct(result);
        }
        this.view.apply(beats[i]!.event);
        this.playSound(beats[i]!);
        continue;
      }

      const byHand = event.type === 'CardRevealed' && event.hand === 0 && !this.autoPlay && !this.flipRest;

      if (byHand) {
        // The player picks the slot; the card is still the next one in deal order,
        // so reveal order (and any future reveal effects) never depends on clicks.
        this.view.player.eager = drama === 'tense';
        if (drama === 'tense') sfx.tension();
        const slot = await this.waitFor('flip');
        if (slot < 0) return null;
        this.view.apply(event, slot);
      } else {
        this.view.anticipate(event, drama);
        if (drama === 'tense' && event.type === 'CardRevealed' && this.speed === 'smart') sfx.tension();
        if (!(await this.clock.wait(beatDelay(beat, this.speed)))) return null;
        this.view.apply(event);
      }
      this.playSound(beat);
    }

    const seat = result.seats[0]!;
    const net = ante.mul(seat.net);
    this.lastAnte = ante;
    this.bank = this.bank.add(net);
    this.sessionNet = this.sessionNet.add(net);
    if (net.gt(this.biggestWin)) this.biggestWin = net;
    this.hands++;
    this.round++;
    this.flushCounts[seat.hand.size] = (this.flushCounts[seat.hand.size] ?? 0) + 1;
    const entry = { round: this.round, size: seat.hand.size, suit: seat.hand.suit, outcome: seat.outcome, net };
    this.history = [entry, ...this.history].slice(0, 12);

    if (this.bank.lte(0)) this.gameOver = true;
    else if (this.ante.gt(this.bank)) this.ante = this.bank.floor().max(1);
    return beats.at(-1)!.drama;
  }

  /** Called right after the event is shown, so each sound lands with what it describes. */
  private playSound({ event }: Beat) {
    switch (event.type) {
      case 'CardRevealed': {
        sfx.flip();
        if (this.speed === '5x') break;
        const hand = event.hand === 'dealer' ? this.view.dealer : this.view.player;
        const grew = hand.eval?.suit === event.card.suit && hand.eval.size >= 3;
        if (grew) (event.hand === 'dealer' ? sfx.dealerSuit : sfx.playerSuit)(hand.eval!.size);
        break;
      }
      case 'RaiseDecided':
        if (event.raise > 0) sfx.chip();
        break;
      case 'SideBetResolved':
        if (event.net > 0) sfx.chip();
        else if (event.owner === 'dealer' && event.net < 0) sfx.lose();
        break;
      case 'RoundSettled':
        if (event.net >= 10) sfx.bigWin();
        else if (event.net > 0) sfx.win();
        else if (event.net < 0) sfx.lose();
        break;
    }
  }
}
