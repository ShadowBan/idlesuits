import {
  BLIND,
  CSP_BONUSES,
  CSP_RULES,
  decideCsp,
  simulateCspRound,
  stepWithChoices,
  type BonusResult,
  type Card,
  type CspDecision,
  type CspEvent,
  type CspMove,
  type CspRoundResult,
  type PokerHand,
  type RoundReport,
} from '@idlesuits/sim';
import { BlindHands } from '../../lib/blind.svelte';
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

const STARTING_ANTE = 5;

/** Milliseconds at 1× before each event is shown. */
const BASE_MS: Record<CspEvent['type'], number> = {
  RoundStarted: 150,
  PlayerCards: 380,
  DealerUpcard: 300,
  Decision: 120,
  Raised: 260,
  Folded: 300,
  DealerRevealed: 700,
  Settled: 240,
  BonusSettled: 260,
  RoundSettled: 420,
};
const RESULT_HOLD_MS = 1400;

const PART_LABEL = { ante: 'Ante', raise: 'Raise' } as const;

export interface HistoryEntry {
  round: number;
  player: string;
  dealer: string;
  net: Decimal;
}

function newSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

export class CspGame {
  /** The rules as designed, with anything the admin panel has changed. */
  get rules() {
    return tuning.rules('csp', CSP_RULES);
  }
  readonly seq = new Sequencer<CspMove>();

  runSeed = $state(newSeed());
  round = $state(0);
  ante = $state(new Decimal(STARTING_ANTE));
  /** Side bets for the next hand, in dollars. */
  readonly side = new SideStakes(CSP_BONUSES);
  /** Chips on the spots for the next hand. */
  readonly bets = new ChipBets(
    () => this.ante,
    (v) => (this.ante = v),
    this.side,
    () => this.bank,
    1,
  );
  /** Counts deals, so the table can throw each new hand in from the shoe. */
  deals = $state(0);
  /** The dealer card about to turn, for a moment of suspense. */
  dealerFocus = $state(-1);
  roundAnte = $state(new Decimal(STARTING_ANTE));
  lastAnte = $state(new Decimal(STARTING_ANTE));
  started = $state(false);
  gameOver = $state(false);
  autoPlay = $state(false);
  suggestion = $state<CspMove | null>(null);

  player = $state<(Card | null)[]>(Array(5).fill(null));
  dealer = $state<(Card | null)[]>(Array(5).fill(null));
  playerHand = $state<PokerHand | null>(null);
  dealerHand = $state<PokerHand | null>(null);
  qualified = $state<boolean | null>(null);
  raised = $state(false);
  folded = $state(false);
  results = $state<Partial<Record<keyof typeof PART_LABEL, { net: number; note: string }>>>({});
  /** Side bets riding on this hand, in antes. */
  roundSide = $state<Record<string, number>>({});
  /** Hands the Lucky Seat deals blind beside the player's, played all in. */
  readonly blind = new BlindHands<CspRoundResult>('csp', {
    show: (r) => ({ cards: r.player, label: SHORT[r.playerHand.category]! }),
    report: (r, sides) => this.reportFor(r, sides),
    net: (r) => r.net,
  });
  bonusResults = $state<Record<string, BonusResult>>({});
  net = $state<number | null>(null);
  breakdown = $state<BreakdownLine[]>([]);
  last = $state<{ lines: BreakdownLine[]; net: number } | null>(null);

  hands = $state(0);
  sessionNet = $state(new Decimal(0));
  biggestWin = $state(new Decimal(0));
  folds = $state(0);
  history = $state<HistoryEntry[]>([]);

  constructor() {
    // Sit back down and the chips and the speed are as you left them.
    this.bets.remember('csp');
    this.seq.remember('csp');
  }

  /** Too little left to deal a hand at this table, even at the smallest bet. */
  get broke(): boolean {
    return this.bank.lt(this.bets.minimum);
  }

  get bank(): Decimal {
    return bankroll.balance;
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
    if (this.seq.awaiting === 'move') this.seq.answer(this.suggestion!);
    else if (this.seq.awaiting === 'deal' && this.bets.canDeal) this.seq.answer('raise');
  }

  choose(move: CspMove) {
    if (this.seq.awaiting === 'move') this.seq.answer(move);
  }

  deal() {
    if (this.seq.awaiting === 'deal' && this.bets.canDeal) this.seq.answer('raise');
  }

  advance() {
    if (this.seq.awaiting === 'move') this.seq.answer(this.suggestion!);
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
    this.ante = new Decimal(STARTING_ANTE);
    this.side.reset();
    // A buy-back starts from the table's opening bets, with auto play off.
    this.bets.save();
    this.autoPlay = false;
    this.hands = 0;
    this.folds = 0;
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

  private async playRound(): Promise<boolean> {
    const ante = this.ante;
    const bonuses = this.side.units(ante);
    this.roundAnte = ante;
    const seed = { run: this.runSeed, round: this.round };
    // Blind hands sit in the seats dealt before the player's; each puts down the ante and the 2× raise.
    const mine = this.blind.deal(this.bank, { unit: ante, sides: bonuses }, 3, (stake, seat) =>
      simulateCspRound({ rules: this.rules, seed, seat, bonuses: stake.sides, decide: BLIND.csp }),
    );
    this.blind.start(() => 3);
    const run = (decide: (d: CspDecision) => CspMove, onEvent: (e: CspEvent) => void) =>
      simulateCspRound({ rules: this.rules, seed, bonuses, decide, onEvent, seat: mine });

    const choices: CspMove[] = [];
    let shown = 0;
    for (;;) {
      const step = stepWithChoices(run, choices);
      if (!(await this.show(step.events.slice(shown)))) return false;
      shown = step.events.length;

      if (step.kind === 'done') {
        this.settle(step.result, ante);
        return true;
      }

      const suggestion = decideCsp(step.decision.cards, step.decision.upcard);
      let choice: CspMove | null = suggestion;
      if (!this.autoPlay) {
        this.suggestion = suggestion;
        choice = await this.seq.ask('move');
        this.suggestion = null;
      }
      if (choice === null) return false;
      choices.push(choice);
    }
  }

  private async show(events: CspEvent[]): Promise<boolean> {
    for (const event of events) {
      if (event.type === 'DealerRevealed') {
        // The dealer turns over one card at a time; the next one lifts first.
        const step = BASE_MS.DealerRevealed * (event.cards.length > 4 ? 0.3 : 0.45);
        for (let i = 0; i < event.cards.length; i++) {
          if (this.dealer[i]) continue;
          this.dealerFocus = i;
          if (!(await this.seq.wait(step))) return false;
          this.dealer[i] = event.cards[i]!;
          sfx.flip();
        }
        this.dealerFocus = -1;
      }
      let ms = BASE_MS[event.type];
      if (this.seq.speed === 'smart') {
        if (event.type === 'Settled' || event.type === 'BonusSettled') ms *= 0.7;
        else if (event.type !== 'DealerRevealed') ms *= 0.8;
      }
      if (!(await this.seq.wait(ms))) return false;
      this.apply(event);
    }
    return true;
  }

  private apply(event: CspEvent) {
    switch (event.type) {
      case 'RoundStarted':
        this.deals++;
        this.bets.touched = false;
        this.dealerFocus = -1;
        this.player = Array(5).fill(null);
        this.dealer = Array(5).fill(null);
        this.playerHand = null;
        this.dealerHand = null;
        this.qualified = null;
        this.raised = false;
        this.folded = false;
        this.results = {};
        this.roundSide = event.bonuses;
        this.bonusResults = {};
        this.net = null;
        this.breakdown = [];
        break;
      case 'PlayerCards':
        this.player = [...event.cards];
        this.playerHand = event.hand;
        sfx.flip();
        break;
      case 'DealerUpcard':
        this.dealer = [event.card, null, null, null, null];
        sfx.flip();
        break;
      case 'Raised':
        this.raised = true;
        sfx.chip();
        break;
      case 'Folded':
        this.folded = true;
        sfx.lose();
        break;
      case 'DealerRevealed':
        this.blind.reveal();
        this.dealer = [...event.cards];
        this.dealerHand = event.hand;
        this.qualified = event.qualified;
        sfx.flip();
        break;
      case 'Settled':
        this.results[event.part] = { net: event.net, note: event.note };
        this.breakdown.push({ label: `${PART_LABEL[event.part]} · ${event.note}`, amount: event.net });
        break;
      case 'BonusSettled':
        this.bonusResults[event.result.id] = event.result;
        this.breakdown.push(bonusLine(CSP_BONUSES, event.result));
        if (event.result.net > 0) sfx.chip();
        break;
      case 'RoundSettled':
        this.blind.showResults();
        this.net = event.net;
        this.last = { lines: [...this.breakdown], net: event.net };
        if (event.net >= 8) sfx.bigWin();
        else if (event.net > 0) sfx.win();
        else if (event.net < 0 && !this.folded) sfx.lose();
        break;
      case 'Decision':
        break;
    }
  }

  /** What the casino is told about one settled hand, for charms and Tokens. */
  private reportFor(r: CspRoundResult, sides = this.roundSide): RoundReport {
    return {
      game: 'csp',
      seed: { run: this.runSeed, round: this.round },
      bets: [
        ...mainBet(1, r.parts.ante),
        ...mainBet(r.folded ? 0 : this.rules.raise, r.parts.raise),
        ...sideBets(r.bonuses, sides),
      ],
      outcome: outcomeOf(r.folded, r.parts.ante + r.parts.raise),
      tier: r.playerHand.category,
    };
  }

  private settle(result: CspRoundResult, ante: Decimal) {
    const blind = this.blind.settle(ante);
    // Charms act on the settled hand; the bankroll is paid the hand and whatever they add.
    const charms = meta.settleRound(this.reportFor(result), ante, result.net);
    const units = result.net + charms.extra;
    if (charms.lines.length) this.net = units;
    if (charms.lines.length || blind.hands) {
      this.last = { lines: [...(this.last?.lines ?? []), ...charms.lines, ...blind.lines], net: units + blind.units };
    }
    const net = ante.mul(units);
    this.lastAnte = ante;
    this.sessionNet = this.sessionNet.add(net).add(blind.money);
    if (net.gt(this.biggestWin)) this.biggestWin = net;
    if (result.folded) this.folds++;
    this.hands += 1 + blind.hands;
    this.round++;
    const short = (hand: PokerHand) => SHORT[hand.category]!;
    const entry: HistoryEntry = {
      round: this.round,
      player: result.folded ? 'fold' : short(result.playerHand),
      dealer: result.qualified ? short(result.dealerHand) : 'no qualify',
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

const SHORT = ['High', 'Pair', '2 pair', 'Trips', 'Straight', 'Flush', 'Full', 'Quads', 'Str flush', 'Royal'];
