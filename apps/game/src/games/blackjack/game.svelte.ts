import { tableProgress, type BjOffer, type TableSettled } from '@idlesuits/engine';
import {
  BJ_BONUSES,
  FREE_BET_RULES,
  handTotal,
  solveStrategy,
  type BjChoice,
  type BjEvent,
  type BjRoundResult,
  type BjRules,
  type Decision,
  type StrategyTables,
} from '@idlesuits/sim';
import { bankroll } from '../../lib/casino.svelte';
import { Decimal } from '../../lib/money';
import { autoplay } from '../../lib/autoplay.svelte';
import { floor } from '../../lib/floor.svelte';
import { player } from '../../lib/player.svelte';
import { landSettled, sidesInDollars, tableAct } from '../../lib/table.svelte';
import { Sequencer } from '../../lib/sequencer.svelte';
import { SideStakes } from '../../lib/sidebets.svelte';
import { sfx } from '../../lib/sound';
import { tuning } from '../../lib/tuning.svelte';
import { ChipBets } from '../../lib/stakes.svelte';
import { BjTableView } from './table.svelte';

const STARTING_BET = 5;
/** Rounds auto play asks for at once. */
const AUTO_BATCH = 5;

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
  /** The basic strategy for the rules in play, solved again when the admin panel changes them. */
  private solved: { rules: BjRules; tables: StrategyTables } | null = null;

  /** Free Bet rules as designed, with anything the admin panel has changed. */
  get rules(): BjRules {
    return tuning.rules('blackjack', FREE_BET_RULES);
  }

  get tables(): StrategyTables {
    const rules = this.rules;
    if (this.solved?.rules !== rules) this.solved = { rules, tables: solveStrategy(rules) };
    return this.solved.tables;
  }
  readonly view = new BjTableView();
  readonly seq = new Sequencer<BjChoice>();
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
  decision = $state<BjOffer | null>(null);
  /** Why the last hand couldn't be dealt or played on, for a moment on screen. */
  error = $state<string | null>(null);

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
    // The shoe's place, as the engine keeps it: its order is the engine's secret.
    const shoe = (player.shown.games.blackjack as { shoe?: { next: number; decks: number } } | undefined)?.shoe;
    if (shoe) this.shoeView = { size: shoe.decks * 52, next: shoe.next, cut: Math.round(shoe.decks * 52 * 0.75) };
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
    const allowed = this.decision?.allowed;
    if ((move === 'double' && !allowed?.double) || (move === 'split' && !allowed?.split)) return;
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

  /**
   * Plays one round, as the engine deals it (on the server, for a member):
   * the bets go down, each decision goes to the engine, and the table shows
   * what comes back. Auto play asks for whole rounds, a few at a time. A hand
   * left mid-way (the page closed) picks up where it was. False if the game
   * was reset part-way through.
   */
  private async playRound(): Promise<boolean> {
    const live = tableProgress(player.truth, 'blackjack').live;
    const bet = live ? new Decimal(live.unit) : this.bet;
    const bonuses = live ? ((live.data.bonuses as Record<string, number>) ?? {}) : this.side.units(bet);
    this.roundBet = bet;
    this.roundSide = bonuses;
    const req = { game: 'blackjack', room: floor.current, bet: bet.toString(), sides: sidesInDollars(bonuses, bet) };
    if (this.autoPlay && !live) {
      const s = autoplay.settings;
      const rounds = Math.min(AUTO_BATCH, s.stopAfter ? Math.max(1, s.stopRounds - autoplay.rounds) : AUTO_BATCH);
      const stop = { winX: s.stopOnWin ? s.stopWinX : undefined, below: s.stopBelow ? s.stopBelowAmount : undefined, above: s.stopAbove ? s.stopAboveAmount : undefined };
      const reply = await tableAct({ type: 'table.auto', ...req, rounds, stop });
      if (!reply.ok) return this.failed(reply.error);
      for (let i = 0; i < reply.plays.length; i++) {
        const play = reply.plays[i]!;
        if (i > 0 && !(await this.seq.wait(RESULT_HOLD_MS))) return false;
        if (!(await this.showPlay(play))) return false;
        if (play.settled) this.settle(play.result as BjRoundResult, play.settled, reply.holds[i] ?? null, bet);
      }
      return true;
    }
    let reply = await tableAct(live ? { type: 'table.resume', game: 'blackjack' } : { type: 'table.deal', ...req });
    if (!reply.ok) return this.failed(reply.error);
    let play = reply.plays[0];
    if (!play) return true;
    let fresh = true;
    for (;;) {
      if (fresh && !(await this.showPlay(play))) return false;
      fresh = true;
      if (play.settled) {
        this.settle(play.result as BjRoundResult, play.settled, reply.holds[0] ?? null, bet);
        return true;
      }
      const decision = play.decision as BjOffer;
      let move: BjChoice | null = decision.suggestion;
      // Insurance the bankroll can't cover is never offered as a choice.
      if (!(decision.kind === 'insurance' && !decision.canInsure) && !this.autoPlay) {
        this.decision = decision;
        move = await this.seq.ask('move');
        this.decision = null;
      }
      if (move === null) return false;
      const next = await tableAct({ type: 'table.move', game: 'blackjack', choice: move });
      if (!next.ok) {
        // Not taken (or no answer): the same decision is asked again.
        this.error = next.error ?? null;
        fresh = false;
        continue;
      }
      this.error = null;
      reply = next;
      play = next.plays[0]!;
    }
  }

  /** Auto play's rules stop it, and the reason shows, when the engine turns a hand down. */
  private failed(error: string | undefined): boolean {
    this.error = error ?? 'The hand couldn’t be dealt.';
    this.autoPlay = false;
    return true;
  }

  /** A play's shuffle (if the shoe was fresh) and its events. */
  private async showPlay(play: { events: unknown[]; info: Record<string, unknown> }): Promise<boolean> {
    const shoe = play.info.shoe as { size: number; next: number; cut: number } | undefined;
    if (play.info.shuffled && (play.events as BjEvent[])[0]?.type === 'RoundStarted') {
      // The cut card came out last round: the dealer shuffles before dealing on.
      this.shuffling = true;
      sfx.shuffle();
      const ok = await this.seq.wait(SHUFFLE_MS);
      this.shuffling = false;
      if (!ok) return false;
    }
    if (shoe && (play.events as BjEvent[])[0]?.type === 'RoundStarted') this.shoeView = { ...shoe };
    this.error = null;
    return this.show(play.events as BjEvent[]);
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

  private settle(result: BjRoundResult, settled: TableSettled, hold: number | null, bet: Decimal) {
    // The hand as the engine settled it, charms and all, shows now that the table has dealt it out.
    const charms = landSettled(settled, hold);
    const units = charms.units;
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
