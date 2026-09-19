import {
  evaluateHand,
  lookupScale,
  sideBetMetric,
  type Card,
  type GameEvent,
  type HandEval,
  type MainOutcome,
  type SideBetDef,
  type SideBetOwner,
} from '@idlesuits/sim';
import type { Drama } from './director';

export interface SideBetView {
  def: SideBetDef;
  owner: SideBetOwner;
  stake: number;
  /** Current metric (flush size, run length) of the owning hand. */
  progress: number;
  /** Smallest metric that pays. */
  target: number;
  /** Pays N:1 at the current progress. */
  livePays: number;
  net: number | null;
}

export interface BreakdownLine {
  label: string;
  /** In antes. */
  amount: number;
}

export class HandView {
  cards = $state<(Card | null)[]>([]);
  eval = $state<HandEval | null>(null);
  /** Index of the face-down card the director is building tension on. */
  focus = $state<number | null>(null);

  reset(size: number) {
    this.cards = Array(size).fill(null);
    this.eval = null;
    this.focus = null;
  }

  reveal(index: number, card: Card) {
    this.cards[index] = card;
    this.focus = null;
    this.eval = evaluateHand(this.cards.filter((c): c is Card => c !== null));
  }
}

function mainLines(outcome: MainOutcome, raise: number): BreakdownLine[] {
  switch (outcome) {
    case 'fold':
      return [{ label: 'Ante (folded)', amount: -1 }];
    case 'dealerNoQualify':
      return [{ label: 'Ante (dealer did not qualify)', amount: 1 }, { label: `Raise ${raise}× (push)`, amount: 0 }];
    case 'win':
      return [{ label: 'Ante', amount: 1 }, { label: `Raise ${raise}×`, amount: raise }];
    case 'lose':
      return [{ label: 'Ante', amount: -1 }, { label: `Raise ${raise}×`, amount: -raise }];
    case 'push':
      return [{ label: 'Ante (push)', amount: 0 }, { label: `Raise ${raise}× (push)`, amount: 0 }];
  }
}

/** Everything the table shows, built only by applying events in order. */
export class TableView {
  player = new HandView();
  dealer = new HandView();
  sideBets = $state<SideBetView[]>([]);
  raise = $state<number | null>(null);
  qualified = $state<boolean | null>(null);
  outcome = $state<MainOutcome | null>(null);
  breakdown = $state<BreakdownLine[]>([]);
  net = $state<number | null>(null);
  /** The most recently finished round, kept visible while the next one plays. */
  last = $state<{ lines: BreakdownLine[]; net: number } | null>(null);
  drama = $state<Drama>('routine');

  constructor(
    private readonly defs: SideBetDef[],
    private readonly seat = 0,
  ) {}

  /** Called before a beat's delay, so the table can lean in before the flip. */
  anticipate(event: GameEvent, drama: Drama) {
    this.drama = drama;
    if (event.type === 'CardRevealed' && drama === 'tense') {
      (event.hand === 'dealer' ? this.dealer : this.player).focus = event.index;
    }
  }

  private refreshSideBets() {
    for (const bet of this.sideBets) {
      const hand = bet.owner === 'dealer' ? this.dealer.eval : this.player.eval;
      bet.progress = hand ? sideBetMetric(bet.def, hand) : 0;
      bet.livePays = lookupScale(bet.def.pays, bet.progress);
    }
  }

  apply(event: GameEvent) {
    switch (event.type) {
      case 'RoundStarted':
        this.player.reset(7);
        this.dealer.reset(7);
        this.sideBets = [];
        this.raise = null;
        this.qualified = null;
        this.outcome = null;
        this.breakdown = [];
        this.net = null;
        break;
      case 'SideBetOwnership': {
        if (event.seat !== this.seat) break;
        const def = this.defs.find((d) => d.id === event.betId)!;
        const target = Math.min(...Object.keys(def.pays.values).map(Number));
        this.sideBets.push({ def, owner: event.owner, stake: event.stake, progress: 0, target, livePays: 0, net: null });
        break;
      }
      case 'CardRevealed':
        if (event.hand === 'dealer') this.dealer.reveal(event.index, event.card);
        else if (event.hand === this.seat) this.player.reveal(event.index, event.card);
        this.refreshSideBets();
        break;
      case 'RaiseDecided':
        if (event.seat === this.seat) this.raise = event.raise;
        break;
      case 'DealerQualified':
        this.qualified = event.qualified;
        break;
      case 'MainBetResolved':
        if (event.seat !== this.seat) break;
        this.outcome = event.outcome;
        this.breakdown.push(...mainLines(event.outcome, this.raise ?? 0));
        break;
      case 'SideBetResolved': {
        if (event.seat !== this.seat) break;
        const bet = this.sideBets.find((b) => b.def.id === event.betId);
        if (bet) bet.net = event.net;
        const whose = event.owner === 'dealer' ? 'dealer-owned ' : '';
        const how = event.pays > 0 ? `hit ${event.pays}:1` : 'miss';
        this.breakdown.push({ label: `${bet?.def.name ?? event.betId} (${whose}${how})`, amount: event.net });
        break;
      }
      case 'RoundSettled':
        if (event.seat === this.seat) {
          this.net = event.net;
          this.last = { lines: [...this.breakdown], net: event.net };
        }
        this.drama = 'routine';
        break;
      case 'AntePlaced':
      case 'HandEvaluated':
        break;
    }
  }
}
