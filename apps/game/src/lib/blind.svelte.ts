import type { Card, RoundReport } from '@idlesuits/sim';
import type { BreakdownLine } from './breakdown';
import { Decimal } from './money';
import { meta } from './meta.svelte';

/** One blind hand on the felt, for BlindSeats. */
export interface BlindSeat {
  cards: Card[];
  /** Face up once the dealer shows; until then nobody, the player included, has seen them. */
  shown: boolean;
  /** The hand made, shown with the cards. */
  label: string;
  /** Everything this hand put down. */
  stake: Decimal;
  /** What it won or lost, once settled. */
  net: Decimal | null;
}

/**
 * How many blind hands to deal this round: as many as the Lucky Seat gives,
 * while the bankroll could cover every hand, the player's own included,
 * losing `exposure` (its bets with every raise made).
 */
export function blindHands(bank: Decimal, exposure: Decimal): number {
  let n = meta.extraHands;
  while (n > 0 && bank.lt(exposure.mul(n + 1))) n--;
  return n;
}

/** What a hand puts down, in base bets: its main bets plus its side bets. */
export function unitsDown(main: number, sides: Readonly<Record<string, number>>): number {
  return Object.values(sides).reduce((sum, s) => sum + s, main);
}

interface BlindRules<R> {
  /** The hand's cards and what it made. */
  show: (result: R) => { cards: Card[]; label: string };
  report: (result: R) => RoundReport;
  /** Everything the hand won or lost, in base bets. */
  net: (result: R) => number;
}

/**
 * A table's blind hands for the round on the felt: dealt (simulated) up front
 * from the seats before the player's, shown face down, turned over with the
 * dealer, and settled one by one, each a hand of its own to the charms.
 */
export class BlindHands<R> {
  seats = $state<BlindSeat[]>([]);
  /** What they won or lost together this round, in dollars, once settled. */
  net = $state(new Decimal(0));
  private results: R[] = [];

  constructor(private readonly rules: BlindRules<R>) {}

  /** The round's blind hands, played out; call before the player's round starts. */
  deal(results: R[]) {
    this.results = results;
  }

  /** As the round starts: the hands land face down, each with `stake` on it. */
  start(stake: Decimal) {
    this.net = new Decimal(0);
    this.seats = this.results.map((r) => ({ ...this.rules.show(r), shown: false, stake, net: null }));
  }

  reveal() {
    for (const seat of this.seats) seat.shown = true;
  }

  /** As the round settles on the felt: each hand's result, before charms. */
  showResults(unit: Decimal) {
    this.results.forEach((r, i) => {
      const seat = this.seats[i];
      if (seat) seat.net = unit.mul(this.rules.net(r));
    });
  }

  /**
   * Pays each blind hand through the charms. Settle them before the player's
   * own hand, so the player's charms are the ones the banner shows.
   */
  settle(unit: Decimal): { money: Decimal; units: number; hands: number; lines: BreakdownLine[] } {
    let money = new Decimal(0);
    let units = 0;
    const lines: BreakdownLine[] = [];
    this.results.forEach((r, i) => {
      const charms = meta.settleRound(this.rules.report(r), unit, this.rules.net(r));
      const net = this.rules.net(r) + charms.extra;
      const seat = this.seats[i];
      if (seat) seat.net = unit.mul(net);
      money = money.add(unit.mul(net));
      units += net;
      lines.push({ label: `Blind ${i + 1} · ${seat?.label.toLowerCase() ?? 'hand'}`, amount: net });
    });
    this.net = money;
    return { money, units, hands: this.results.length, lines };
  }

  clear() {
    this.results = [];
    this.seats = [];
    this.net = new Decimal(0);
  }
}
