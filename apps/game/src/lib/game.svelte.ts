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
import { beatDelay, direct, type Beat, type SpeedMode } from './director';
import { Decimal } from './money';
import { sfx } from './sound';
import { TableView } from './table.svelte';

const STARTING_BANK = 500;
const STARTING_ANTE = 5;
const BETWEEN_ROUNDS_MS = 350;

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

  start() {
    if (this.started) return;
    this.started = true;
    void this.loop();
  }

  togglePause() {
    this.paused = !this.paused;
    this.clock.paused = this.paused;
  }

  restart() {
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
    while (this.started && !this.gameOver) {
      if (!(await this.playRound())) return;
      if (!(await this.clock.wait(BETWEEN_ROUNDS_MS))) return;
    }
  }

  /** Plays one round; returns false if the game was reset mid-round. */
  private async playRound(): Promise<boolean> {
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

    for (const beat of direct(result)) {
      this.view.anticipate(beat.event, beat.drama);
      if (beat.drama === 'tense' && beat.event.type === 'CardRevealed' && this.speed === 'smart') sfx.tension();
      if (!(await this.clock.wait(beatDelay(beat, this.speed)))) return false;
      this.view.apply(beat.event);
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
    return true;
  }

  private playSound({ event, drama }: Beat) {
    switch (event.type) {
      case 'CardRevealed': {
        const hand = event.hand === 'dealer' ? this.view.dealer : this.view.player;
        const best = hand.eval?.suitCounts[event.card.suit] ?? 1;
        const isBest = hand.eval?.suit === event.card.suit && best >= 3;
        sfx.flip(best);
        if (isBest && this.speed !== '5x') sfx.suitUp(best);
        break;
      }
      case 'RaiseDecided':
        if (event.raise > 0) sfx.chip();
        break;
      case 'RoundSettled':
        if (event.net >= 10) sfx.bigWin();
        else if (event.net > 0 && drama !== 'routine') sfx.win();
        else if (event.net <= -3) sfx.lose();
        break;
    }
  }
}
