import {
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
} from '@idlesuits/sim';
import type { BreakdownLine } from '../../lib/breakdown';
import { bankroll } from '../../lib/casino.svelte';
import { Decimal } from '../../lib/money';
import { Sequencer } from '../../lib/sequencer.svelte';
import { bonusLine, SideStakes } from '../../lib/sidebets.svelte';
import { sfx } from '../../lib/sound';

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
  readonly rules = LIR_RULES;
  readonly seq = new Sequencer<LirMove>();

  runSeed = $state(newSeed());
  round = $state(0);
  /** Each of the three equal bets. */
  bet = $state(new Decimal(STARTING_BET));
  /** Side bets for the next hand, in dollars. */
  readonly side = new SideStakes(LIR_BONUSES);
  roundBet = $state(new Decimal(STARTING_BET));
  lastBet = $state(new Decimal(STARTING_BET));
  started = $state(false);
  gameOver = $state(false);
  autoPlay = $state(false);
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
  bonusResults = $state<Record<string, BonusResult>>({});
  net = $state<number | null>(null);
  breakdown = $state<BreakdownLine[]>([]);
  last = $state<{ lines: BreakdownLine[]; net: number } | null>(null);

  hands = $state(0);
  sessionNet = $state(new Decimal(0));
  biggestWin = $state(new Decimal(0));
  pulled = $state(0);
  history = $state<HistoryEntry[]>([]);

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
    void this.loop();
  }

  setAutoPlay(on: boolean) {
    this.autoPlay = on;
    if (!on) return;
    if (this.seq.awaiting === 'move') this.seq.answer(this.pending!.suggestion);
    else if (this.seq.awaiting === 'deal') this.seq.answer('ride');
  }

  choose(move: LirMove) {
    if (this.seq.awaiting === 'move') this.seq.answer(move);
  }

  deal() {
    if (this.seq.awaiting === 'deal') this.seq.answer('ride');
  }

  advance() {
    if (this.seq.awaiting === 'move') this.seq.answer(this.pending!.suggestion);
    else this.deal();
  }

  changeBet(factor: number) {
    const next = this.bet.mul(factor).floor().max(1);
    this.bet = next.gt(this.bank) ? this.bank.floor().max(1) : next;
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
    this.pulled = 0;
    this.sessionNet = new Decimal(0);
    this.biggestWin = new Decimal(0);
    this.history = [];
    this.last = null;
    this.gameOver = false;
    this.started = false;
    this.start();
  }

  private async loop() {
    while (this.started && !this.gameOver && !this.seq.disposed) {
      if (!(await this.playRound())) return;
      if (this.gameOver) return;
      const ok = this.autoPlay ? await this.seq.wait(RESULT_HOLD_MS) : (await this.seq.ask('deal')) !== null;
      if (!ok) return;
    }
  }

  private async playRound(): Promise<boolean> {
    const bet = this.bet;
    const bonuses = this.side.units(bet);
    this.roundBet = bet;
    const seed = { run: this.runSeed, round: this.round };
    const run = (decide: (d: LirDecision) => LirMove, onEvent: (e: LirEvent) => void) =>
      simulateLirRound({ seed, bonuses, decide, onEvent });

    const choices: LirMove[] = [];
    let shown = 0;
    for (;;) {
      const step = stepWithChoices(run, choices);
      if (!(await this.show(step.events.slice(shown)))) return false;
      shown = step.events.length;

      if (step.kind === 'done') {
        this.settle(step.result, bet);
        return true;
      }

      const suggestion = decideLir(step.decision.cards);
      let choice: LirMove | null = suggestion;
      if (!this.autoPlay) {
        this.pending = { bet: step.decision.bet, suggestion };
        choice = await this.seq.ask('move');
        this.pending = null;
      }
      if (choice === null) return false;
      choices.push(choice);
    }
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

  private settle(result: LirRoundResult, bet: Decimal) {
    const net = bet.mul(result.net);
    this.lastBet = bet;
    bankroll.settle(net);
    this.sessionNet = this.sessionNet.add(net);
    if (net.gt(this.biggestWin)) this.biggestWin = net;
    this.pulled += result.riding.filter((r) => !r).length;
    this.hands++;
    this.round++;
    const entry: HistoryEntry = {
      round: this.round,
      hand: handName(result.hand),
      riding: result.riding.filter(Boolean).length,
      net,
    };
    this.history = [entry, ...this.history].slice(0, 12);
    if (this.bank.lte(0)) this.gameOver = true;
    else if (this.bet.gt(this.bank)) this.bet = this.bank.floor().max(1);
  }
}
