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
  type RoundReport,
  type TableRules,
  type GameEvent,
  type RoundResult,
} from '@idlesuits/sim';
import { tableProgress, type SuitsDecision, type TablePlay } from '@idlesuits/engine';
import { autoplay } from '../../lib/autoplay.svelte';
import { autoFeed, SPEED } from '../../lib/autofeed.svelte';
import { floor } from '../../lib/floor.svelte';
import { player } from '../../lib/player.svelte';
import { landSettled, sidesInDollars, tableAct, type TableReply } from '../../lib/table.svelte';
import { bankroll } from '../../lib/casino.svelte';
import { Clock } from '../../lib/clock';
import { beatDelay, direct, resultHold, type Beat, type Drama, type SpeedMode } from './director';
import { Decimal } from '../../lib/money';
import { meta } from '../../lib/meta.svelte';
import { mainBet } from '../../lib/report';
import { load, save } from '../../lib/save';
import { SideStakes } from '../../lib/sidebets.svelte';
import { sfx } from '../../lib/sound';
import { tuning } from '../../lib/tuning.svelte';
import { ChipBets } from '../../lib/stakes.svelte';
import { TableView } from './table.svelte';

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
  /** The rules as designed, with anything the admin panel has changed (the qualifier, the raise caps). */
  get rules(): TableRules {
    return tuning.rules('suits', DEFAULT_RULES);
  }
  readonly shoe: Card[] = buildShoe(standardDeck('player'));
  readonly view = new TableView(this.rules.sideBets);
  private readonly clock = new Clock();

  runSeed = $state(newSeed());
  round = $state(0);
  ante = $state(new Decimal(STARTING_ANTE));
  /** The ante the round on the table was dealt at; `ante` only applies to the next round. */
  roundAnte = $state(new Decimal(STARTING_ANTE));
  /** The ante of the last finished round, for its breakdown. */
  lastAnte = $state(new Decimal(STARTING_ANTE));
  started = $state(false);
  paused = $state(false);
  gameOver = $state(false);
  #speed = $state<SpeedMode>(load<SpeedMode>('speed.suits', 'smart'));

  get speed(): SpeedMode {
    return this.#speed;
  }

  set speed(value: SpeedMode) {
    this.#speed = value;
    save('speed.suits', value);
  }
  /** Dollar stake per side bet for the next hand; zero means not claimed. Independent of the ante. */
  readonly side = new SideStakes(this.rules.sideBets);
  /** Chips on the spots for the next hand. */
  readonly bets = new ChipBets(
    () => this.ante,
    (v) => (this.ante = v),
    this.side,
    () => this.bank,
    1,
    // Enough left over for a 1× raise: no hand is dealt that the player couldn't see through.
    1,
  );
  /** Counts deals, so the table can throw each new hand in from the shoe. */
  deals = $state(0);
  raisePlan = $state<RaisePlan>(load('plan.suits', structuredClone(DEFAULT_PLAN)));
  estimate = $state<Estimate | null>(null);
  /** Dev toggle: the dealer takes any side bet the player leaves open. */
  dealerClaims = $state(load('dealerClaims.suits', false));

  hands = $state(0);
  sessionNet = $state(new Decimal(0));
  biggestWin = $state(new Decimal(0));
  flushCounts = $state<Record<number, number>>({});
  history = $state<HistoryEntry[]>([]);

  /** Off: the player deals each hand and flips their own cards. */
  autoPlay = $state(false);
  /** Why the last hand couldn't be dealt or played on, for a moment on screen. */
  error = $state<string | null>(null);
  /** What the game is waiting on the player for, if anything. */
  awaiting = $state<'flip' | 'bet' | 'deal' | null>(null);
  /** While awaiting 'bet': the most the player may raise, and what their plan would do. */
  betChoice = $state<{ cap: number; suggested: number } | null>(null);
  private resolveWait: ((slot: number) => void) | null = null;
  /** Set by "Flip all": the rest of this hand's cards reveal on their own. */
  private flipRest = false;
  private disposed = false;
  private estimator: Worker | null = null;
  /** How dramatic the last hand was: a big one stays on the table longer under auto play. */
  private lastDrama: Drama = 'routine';
  private estimateId = 0;
  private pendingEstimate: { id: number; ante: Decimal } | null = null;

  constructor() {
    this.side.stakes = { ...this.side.stakes, flushRush: new Decimal(STARTING_ANTE) };
    // Sit back down and the chips are as you left them.
    this.bets.remember('suits');
    this.view.apply({ type: 'RoundStarted', round: 0, shoeSize: this.shoe.length, seats: 1 });
  }

  get sideStakes(): Record<string, Decimal> {
    return this.side.stakes;
  }

  /** The shared casino wallet; every table pays into the same one. */
  /** Too little left to deal a hand at this table, even at the smallest bet. */
  get broke(): boolean {
    return this.bank.lt(this.bets.minimum);
  }

  get bank(): Decimal {
    return bankroll.balance;
  }

  start() {
    if (this.started || this.disposed) return;
    this.started = true;
    // Auto play still running here on the engine's clock (left on, or away): the table picks it back up.
    if (autoFeed.isOn('suits')) queueMicrotask(() => this.setAutoPlay(true));
    // Sitting down with too little to bet goes straight to the buy-back.
    if (this.broke) {
      // Losing it all is the penalty for running unattended: auto play stops until it's pressed again.
      this.gameOver = true;
      this.autoPlay = false;
    }
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
    else if (this.awaiting === 'deal' && this.bets.canDeal) this.answer(0);
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
    if (this.awaiting === 'deal' && this.bets.canDeal) this.answer(0);
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
    // Anything still held back for this table's show is shown as it is.
    player.releaseAll();
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
    bankroll.buyIn();
    this.ante = new Decimal(STARTING_ANTE);
    this.side.reset();
    this.side.stakes = { ...this.side.stakes, flushRush: new Decimal(STARTING_ANTE) };
    // A buy-back starts from the table's opening bets, with auto play off.
    this.bets.save();
    this.autoPlay = false;
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

  /** Bets go down before every hand; auto play deals on its own once there is a bet. */
  private async loop() {
    while (this.started && !this.gameOver && !this.disposed) {
      const auto = this.autoPlay && this.bets.canDeal && this.hands > 0;
      const ok = auto
        ? await this.clock.wait(resultHold(this.lastDrama, this.speed))
        : (await this.waitFor('deal')) >= 0;
      if (!ok) return;
      if (!this.bets.canDeal) continue;
      const drama = await this.playRound();
      if (drama === null) return;
      this.lastDrama = drama;
    }
  }

  /**
   * Plays one round, as the engine deals it (on the server, for a member), or a
   * few under auto play: the ante goes down, the player's cards turn (by hand,
   * unless auto play is dealing), the raise goes to the engine, and the dealer
   * shows. A hand left mid-way picks up where it was. Returns how dramatic the
   * last result was, or null if the game was reset mid-round.
   */
  private async playRound(): Promise<Drama | null> {
    const live = tableProgress(player.truth, 'suits').live;
    const ante = live ? new Decimal(live.unit) : this.ante;
    const units: Record<string, number> = {};
    for (const [id, stake] of Object.entries(this.sideStakes)) if (stake.gt(0)) units[id] = stake.div(ante).toNumber();
    const req = { room: floor.current, bet: ante.toString(), sides: sidesInDollars(units, ante), options: { plan: $state.snapshot(this.raisePlan), dealerClaims: this.dealerClaims } };
    this.roundAnte = ante;
    let reply: TableReply;
    if (this.autoPlay && !live) {
      const s = autoplay.settings;
      reply = await tableAct({
        type: 'table.auto',
        game: 'suits',
        ...req,
        rounds: Math.min(5, s.stopAfter ? Math.max(1, s.stopRounds - autoplay.rounds) : 5),
        stop: { winX: s.stopOnWin ? s.stopWinX : undefined, below: s.stopBelow ? s.stopBelowAmount : undefined, above: s.stopAbove ? s.stopAboveAmount : undefined },
      }, SPEED[this.speed] ?? 1);
      if (!reply.ok) return this.failed(reply.error);
      let drama: Drama = 'routine';
      for (let i = 0; i < reply.plays.length; i++) {
        const play = reply.plays[i]!;
        if (i > 0 && !(await this.clock.wait(resultHold(drama, this.speed)))) return null;
        reply.begin(i);
        // A hand auto play dealt turns over on its own, even if auto play stops while it's shown.
        this.flipRest = true;
        this.bets.touched = false;
        const beats = await this.playBeats(play.events as GameEvent[], [], ante);
        if (!beats) return null;
        drama = this.settle(play, reply.holds[i] ?? null, ante) ?? beats.at(-1)!.drama;
      }
      return drama;
    }
    reply = await tableAct(live ? { type: 'table.resume', game: 'suits' } : { type: 'table.deal', game: 'suits', ...req });
    if (!reply.ok) return this.failed(reply.error);
    let play = reply.plays[0];
    if (!play) return 'routine';
    this.flipRest = false;
    this.bets.touched = false;
    const seen: GameEvent[] = [];
    for (;;) {
      const beats = await this.playBeats(play.events as GameEvent[], seen, ante);
      if (!beats) return null;
      seen.push(...(play.events as GameEvent[]));
      if (play.settled) return this.settle(play, reply.holds[0] ?? null, ante) ?? beats.at(-1)?.drama ?? 'routine';
      // The raise: the player picks it (up to what the bank covers), unless auto play takes the plan's.
      const decision = play.decision as SuitsDecision;
      let raise = decision.suggested;
      if (!this.autoPlay) {
        this.betChoice = { cap: decision.cap, suggested: decision.suggested };
        raise = await this.waitFor('bet');
        this.betChoice = null;
        if (raise < 0) return null;
      }
      const next = await tableAct({ type: 'table.move', game: 'suits', choice: Math.min(raise, decision.cap) });
      if (!next.ok) {
        this.failed(next.error);
        this.autoPlay = false;
        continue;
      }
      reply = next;
      play = next.plays[0]!;
      // The raise as made shows at once; the rest of the round plays out from there.
      const first = (play.events as GameEvent[])[0];
      if (first?.type === 'RaiseDecided') {
        this.view.apply(first);
        this.playSound({ event: first, drama: 'routine' });
        seen.push(first);
        play = { ...play, events: (play.events as GameEvent[]).slice(1) };
      }
    }
  }

  /** The engine turned the round down: why, for a moment on screen. */
  private failed(error: string | undefined): Drama {
    this.error = error ?? 'The hand couldn’t be dealt.';
    this.autoPlay = false;
    return 'routine';
  }

  /**
   * Shows events beat by beat, paced by how dramatic each is (as judged from
   * the round so far, `before` them). The player turns their own cards unless
   * auto play is dealing. Returns the beats, or null if the game was reset.
   */
  private async playBeats(events: GameEvent[], before: GameEvent[], ante: Decimal) {
    void ante;
    const all = direct({ events: [...before, ...events], dealerCards: Array(this.rules.handSize) } as unknown as RoundResult);
    const beats = all.slice(before.length);
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
        if (event.type === 'RoundStarted') this.deals++;
        this.view.apply(event);
      }
      this.playSound(beat);
    }
    return beats;
  }

  /** A round the engine settled, now shown: it counts in the session. Returns its drama, from its net. */
  private settle(play: TablePlay, hold: number | null, ante: Decimal): Drama | null {
    const seat = (play.result as RoundResult).seats[0]!;
    // The hand as the engine settled it, charms and all, shows now that the table has dealt it out.
    const charms = landSettled(play.settled!, hold);
    const units = charms.units;
    if (charms.lines.length) {
      this.view.net = units;
      this.view.last = { lines: [...(this.view.last?.lines ?? []), ...charms.lines], net: units };
    }
    const net = ante.mul(units);
    this.lastAnte = ante;
    this.sessionNet = this.sessionNet.add(net);
    if (net.gt(this.biggestWin)) this.biggestWin = net;
    this.hands++;
    this.round++;
    this.flushCounts[seat.hand.size] = (this.flushCounts[seat.hand.size] ?? 0) + 1;
    const entry = { round: this.round, size: seat.hand.size, suit: seat.hand.suit, outcome: seat.outcome, net };
    this.history = [entry, ...this.history].slice(0, 12);
    if (this.broke) {
      // Losing it all is the penalty for running unattended: auto play stops until it's pressed again.
      this.gameOver = true;
      this.autoPlay = false;
    } else this.bets.fit();
    return Math.abs(seat.net) >= 10 ? 'tense' : Math.abs(seat.net) >= 3 ? 'interesting' : null;
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
