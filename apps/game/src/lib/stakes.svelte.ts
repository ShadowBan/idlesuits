import { Decimal } from './money';
import type { SideStakes } from './sidebets.svelte';

/**
 * Chips the player sets on a table's spots for the next hand: the main bet
 * (an ante, or a blackjack bet) and any side bets. Never more than the
 * bankroll can cover, counting bets that must match the main one (a Blind
 * the size of the Ante, Let It Ride's three equal bets).
 */
export class ChipBets {
  /** The player has moved chips since the last hand, so the felt shows the next bet, not the last result. */
  touched = $state(false);

  constructor(
    private readonly getMain: () => Decimal,
    private readonly setMain: (value: Decimal) => void,
    private readonly side: SideStakes<{ id: string }>,
    private readonly bank: () => Decimal,
    /** How many times the main bet goes down to start: 2 with a matching Blind. */
    private readonly mainUnits = 1,
  ) {}

  /** Everything the next hand puts down before any cards. */
  get total(): Decimal {
    return this.getMain().mul(this.mainUnits).add(this.side.total);
  }

  get canDeal(): boolean {
    return this.getMain().gt(0) && this.total.lte(this.bank());
  }

  private get room(): Decimal {
    return this.bank().sub(this.total).max(0);
  }

  /** Adds a chip to the main bet; false if the bankroll cannot cover it. */
  addMain(amount: Decimal): boolean {
    const add = Decimal.min(amount, this.room.div(this.mainUnits)).floor();
    if (add.lte(0)) return false;
    this.setMain(this.getMain().add(add));
    this.touched = true;
    return true;
  }

  clearMain() {
    this.setMain(new Decimal(0));
    this.touched = true;
  }

  addSide(id: string, amount: Decimal): boolean {
    const add = Decimal.min(amount, this.room).floor();
    if (add.lte(0)) return false;
    this.side.add(id, add);
    this.touched = true;
    return true;
  }

  clearSide(id: string) {
    this.side.clear(id);
    this.touched = true;
  }

  clearAll() {
    this.setMain(new Decimal(0));
    this.side.reset();
    this.touched = true;
  }

  /** Doubles every bet, if the bankroll covers it. */
  double(): boolean {
    if (this.total.mul(2).gt(this.bank())) return false;
    this.setMain(this.getMain().mul(2));
    this.side.double();
    this.touched = true;
    return true;
  }

  /** Keeps a standing bet the bankroll can still cover after a loss. */
  fitToBank() {
    if (this.total.lte(this.bank())) return;
    const scale = this.bank().div(this.total);
    this.setMain(this.getMain().mul(scale).floor());
    for (const [id, s] of Object.entries(this.side.stakes)) {
      this.side.clear(id);
      this.side.add(id, s.mul(scale).floor());
    }
  }
}

/** What a bet spot shows: chips, how they settled, and a different bet waiting for the next hand. */
export interface SpotView {
  amount: Decimal;
  net: Decimal | null;
  next: Decimal | null;
}

/**
 * Between hands, once the player has moved chips, a spot shows the next bet.
 * Otherwise it shows this hand's chips (`roundUnits` of `unit`) and, once
 * settled, what they won or lost, with any change queued for the next hand.
 */
export function spotView(
  betting: boolean,
  unit: Decimal,
  roundUnits: number,
  next: Decimal,
  netUnits: number | undefined,
): SpotView {
  if (betting) return { amount: next, net: null, next: null };
  return {
    amount: unit.mul(roundUnits),
    net: netUnits === undefined ? null : unit.mul(netUnits),
    next,
  };
}
