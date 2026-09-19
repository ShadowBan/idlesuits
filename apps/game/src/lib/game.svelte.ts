import {
  buildShoe,
  DEFAULT_RULES,
  OPTIMAL_BASE_POLICY,
  simulateRound,
  standardDeck,
  type Card,
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
  claims = $state<Record<string, boolean>>({ flushRush: true, superFlushRush: false });
  /** Dev toggle: the dealer takes any side bet the player leaves open. */
  dealerClaims = $state(false);

  hands = $state(0);
  sessionNet = $state(new Decimal(0));
  biggestWin = $state(new Decimal(0));
  flushCounts = $state<Record<number, number>>({});
  history = $state<HistoryEntry[]>([]);

  /** Off: the player deals each hand and flips their own cards. */
  autoPlay = $state(true);
  /** What the game is waiting on the player for, if anything. */
  awaiting = $state<'flip' | 'deal' | null>(null);
  private resolveWait: ((slot: number) => void) | null = null;
  /** Set by "Flip all": the rest of this hand's cards reveal on their own. */
  private flipRest = false;
  private disposed = false;

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
    if (on) this.answer(this.awaiting === 'flip' ? this.nextFaceDown() : 0);
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

  /** Space/Enter: flip the next card, or deal. */
  advance() {
    if (this.awaiting === 'flip') this.flip(this.nextFaceDown());
    else this.deal();
  }

  private nextFaceDown(): number {
    return this.view.player.cards.findIndex((c) => c === null);
  }

  private waitFor(kind: 'flip' | 'deal'): Promise<number> {
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
    const rules = { ...this.rules, unclaimedOwner: this.dealerClaims ? ('dealer' as const) : ('none' as const) };
    const sideBets = Object.fromEntries(Object.entries(this.claims).filter(([, on]) => on).map(([id]) => [id, 1]));
    const result = simulateRound({
      shoe: this.shoe,
      seats: [{ raisePolicy: OPTIMAL_BASE_POLICY, sideBets }],
      rules,
      seed: { run: this.runSeed, dealerId: 'standard', round: this.round },
      recordEvents: true,
    });
    const ante = this.ante;
    this.roundAnte = ante;
    this.flipRest = false;

    const beats = direct(result);
    for (const beat of beats) {
      const { event, drama } = beat;
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
