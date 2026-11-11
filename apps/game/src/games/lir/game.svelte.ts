import {
  BLIND,
  bestFive,
  decideLir,
  handName,
  LIR_BONUSES,
  LIR_RULES,
  simulateLirRound,
  stepWithChoices,
  type BonusResult,
  type Card,
  type LirDecision,
  type LirEvent,
  type LirMove,
  type LirRoundResult,
  type PokerHand,
  type RoundReport,
} from '@idlesuits/sim';
import type { TableSettled } from '@idlesuits/engine';
import { BlindHands } from '../../lib/blind.svelte';
import { autoFeed, SPEED } from '../../lib/autofeed.svelte';
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
const BASE_MS: Record<LirEvent['type'], number> = {
  RoundStarted: 150,
  PlayerCards: 380,
  Decision: 120,
  Rode: 240,
  Pulled: 300,
  CommunityCard: 520,
  FinalHand: 360,
  BonusSettled: 260,
  RoundSettled: 420,
};
const RESULT_HOLD_MS = 1500;

export interface HistoryEntry {
  round: number;
  hand: string;
  riding: number;
  net: Decimal;
}

function newSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

export class LirGame {
  /** The rules as designed, with anything the admin panel has changed. */
  get rules() {
    return tuning.rules('lir', LIR_RULES);
  }
  readonly seq = new Sequencer<LirMove>();

  runSeed = $state(newSeed());
  round = $state(0);
  /** Each of the three equal bets. */
  bet = $state(new Decimal(STARTING_BET));
  /** Side bets for the next hand, in dollars. */
  readonly side = new SideStakes(LIR_BONUSES);
  /** Chips on the spots for the next hand. */
  readonly bets = new ChipBets(
    () => this.bet,
    (v) => (this.bet = v),
    this.side,
    () => this.bank,
    3,
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
  /** While deciding: which bet, and what the strategy says. */
  pending = $state<{ bet: 1 | 2; suggestion: LirMove } | null>(null);

  hole = $state<(Card | null)[]>([null, null, null]);
  community = $state<(Card | null)[]>([null, null]);
  /** Bet 1, bet 2 and the last bet: true riding, false pulled back, null not decided yet. */
  riding = $state<(boolean | null)[]>([null, null, true]);
  hand = $state<PokerHand | null>(null);
  multiplier = $state<number | null>(null);
  /** Side bets riding on this hand, in bets. */
  roundSide = $state<Record<string, number>>({});
  /** Hands the Lucky Seat deals blind beside the player's, played all in. */
  readonly blind = new BlindHands('lir');
  bonusResults = $state<Record<string, BonusResult>>({});
  net = $state<number | null>(null);
  breakdown = $state<BreakdownLine[]>([]);
  last = $state<{ lines: BreakdownLine[]; net: number } | null>(null);

  hands = $state(0);
  sessionNet = $state(new Decimal(0));
  biggestWin = $state(new Decimal(0));
  pulled = $state(0);
  history = $state<HistoryEntry[]>([]);

  constructor() {
    // Sit back down and the chips and the speed are as you left them.
    this.bets.remember('lir');
    this.seq.remember('lir');
  }

  /** Too little left to deal a hand at this table, even at the smallest bet. */
  get broke(): boolean {
    return this.bank.lt(this.bets.minimum);
  }

  get bank(): Decimal {
    return bankroll.balance;
  }

  get best(): Set<string> {
    const shown = [...this.hole, ...this.community].filter((c): c is Card => c !== null);
    if (shown.length < 5) return new Set();
    return new Set(bestFive(shown).map((c) => c.uid));
  }

  /** How many of the three bets are still up. */
  get up(): number {
    return this.riding.filter((r) => r !== false).length;
  }

  start() {
    if (this.started || this.seq.disposed) return;
    this.started = true;
    // Auto play still running here on the engine's clock (left on, or away): the table picks it back up.
    if (autoFeed.isOn('lir')) queueMicrotask(() => this.setAutoPlay(true));
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
    if (this.seq.awaiting === 'move') this.seq.answer(this.pending!.suggestion);
    else if (this.seq.awaiting === 'deal' && this.bets.canDeal) this.seq.answer('ride');
  }

  choose(move: LirMove) {
    if (this.seq.awaiting === 'move') this.seq.answer(move);
  }

  deal() {
    if (this.seq.awaiting === 'deal' && this.bets.canDeal) this.seq.answer('ride');
  }

  advance() {
    if (this.seq.awaiting === 'move') this.seq.answer(this.pending!.suggestion);
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
    this.pulled = 0;
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
    return playTable<LirDecision, LirMove>({
      game: 'lir',
      request: () => ({ bet: this.bet.toString(), sides: sidesInDollars(this.side.units(this.bet), this.bet), blind: this.blind.request() }),
      autoPlay: () => this.autoPlay,
      wait: (ms) => this.seq.wait(ms),
      between: RESULT_HOLD_MS,
      speed: SPEED[this.seq.speed] ?? 1,
      start: (play, unit) => {
        this.roundBet = unit;
        this.blind.fromDeal(play.blind, Number(play.info.holeCards) || 0);
      },
      ready: (play, unit) => void this.blind.fromSettled(play.settled!.blind, unit),
      show: (events) => this.show(events as LirEvent[]),
      decide: async (decision) => {
        const suggestion = decideLir(decision.cards);
        if (this.autoPlay) return suggestion;
        this.pending = { bet: decision.bet, suggestion };
        const choice = await this.seq.ask('move');
        this.pending = null;
        return choice;
      },
      settled: (play, hold, unit) => this.settle(play.result as LirRoundResult, play.settled!, hold, unit),
      failed: (error) => {
        this.error = error;
        this.autoPlay = false;
      },
    });
  }

  private async show(events: LirEvent[]): Promise<boolean> {
    for (const event of events) {
      let ms = BASE_MS[event.type];
      if (this.seq.speed === 'smart' && event.type === 'CommunityCard') ms *= event.index === 1 ? 1.5 : 0.8;
      if (!(await this.seq.wait(ms))) return false;
      this.apply(event);
    }
    return true;
  }

  private apply(event: LirEvent) {
    switch (event.type) {
      case 'RoundStarted':
        this.deals++;
        this.bets.touched = false;
        this.dealerFocus = -1;
        this.hole = [null, null, null];
        this.community = [null, null];
        this.riding = [null, null, true];
        this.hand = null;
        this.multiplier = null;
        this.roundSide = event.bonuses;
        this.bonusResults = {};
        this.net = null;
        this.breakdown = [];
        break;
      case 'PlayerCards':
        this.hole = [...event.cards];
        sfx.flip();
        break;
      case 'Rode':
        this.riding[event.bet - 1] = true;
        sfx.chip();
        break;
      case 'Pulled':
        this.riding[event.bet - 1] = false;
        break;
      case 'CommunityCard':
        this.community[event.index] = event.card;
        sfx.flip();
        break;
      case 'FinalHand': {
        this.blind.reveal();
        this.hand = event.hand;
        this.multiplier = event.multiplier;
        const label = event.multiplier > 0 ? `${handName(event.hand)} pays ${event.multiplier}:1` : 'no pay';
        this.breakdown = [{ label: `${event.riding} bet${event.riding > 1 ? 's' : ''} · ${label}`, amount: event.multiplier * event.riding }];
        break;
      }
      case 'BonusSettled':
        this.bonusResults[event.result.id] = event.result;
        this.breakdown.push(bonusLine(LIR_BONUSES, event.result));
        if (event.result.net > 0) sfx.chip();
        break;
      case 'RoundSettled':
        this.blind.showResults();
        this.net = event.net;
        this.last = { lines: [...this.breakdown], net: event.net };
        if (event.net >= 10) sfx.bigWin();
        else if (event.net > 0) sfx.win();
        else if (event.net < 0) sfx.lose();
        break;
      case 'Decision':
        break;
    }
  }

  /** What the casino is told about one settled hand, for charms and Tokens. */

  private settle(result: LirRoundResult, settled: TableSettled, hold: number | null, bet: Decimal) {
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
    this.pulled += result.riding.filter((r) => !r).length;
    this.hands += 1 + blind.hands;
    this.round++;
    const entry: HistoryEntry = {
      round: this.round,
      hand: handName(result.hand),
      riding: result.riding.filter(Boolean).length,
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
