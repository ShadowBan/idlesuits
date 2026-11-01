import { floor } from './floor.svelte';
import { Decimal, formatMoney } from './money';
import { room, type Room } from './rooms';
import { load, saveSoon } from './save';
import type { SideStakes } from './sidebets.svelte';

/**
 * Chips the player sets on a table's spots for the next hand: the main bet
 * (an ante, or a blackjack bet) and any side bets. Kept within the room's
 * table limits and never more than the bankroll can cover, counting bets that
 * must match the main one (a Blind the size of the Ante, Let It Ride's three
 * equal bets).
 */
export class ChipBets {
  /** The player has moved chips since the last hand, so the felt shows the next bet, not the last result. */
  touched = $state(false);
  /** Where this table's bets are saved, once `remember` has been called. */
  private key: string | null = null;

  constructor(
    private readonly getMain: () => Decimal,
    private readonly setMain: (value: Decimal) => void,
    private readonly side: SideStakes<{ id: string }>,
    private readonly bank: () => Decimal,
    /** How many times the main bet goes down to start: 2 with a matching Blind. */
    private readonly mainUnits = 1,
  ) {}

  get limits(): Room {
    return floor.room;
  }

  /** The least the bankroll needs to deal a hand here: the Main Floor's minimum on each bet that must go down. */
  get minimum(): Decimal {
    return room(0).min.mul(this.mainUnits);
  }

  /** Everything the next hand puts down before any cards. */
  get total(): Decimal {
    return this.getMain().mul(this.mainUnits).add(this.side.total);
  }

  get canDeal(): boolean {
    const main = this.getMain();
    return main.gte(this.limits.min) && main.lte(this.limits.max) && this.total.lte(this.bank());
  }

  /** Why a bet on the felt can't be dealt yet, if it's the table's limits that stop it. */
  get hint(): string | null {
    const main = this.getMain();
    if (main.gt(0) && main.lt(this.limits.min)) return `Table minimum ${formatMoney(this.limits.min)}`;
    return null;
  }

  private get spare(): Decimal {
    return this.bank().sub(this.total).max(0);
  }

  /** Adds a chip to the main bet; false if the bankroll or the table maximum won't take it. */
  addMain(amount: Decimal): boolean {
    const add = Decimal.min(amount, Decimal.min(this.spare.div(this.mainUnits), this.limits.max.sub(this.getMain()))).floor();
    if (add.lte(0)) return false;
    this.setMain(this.getMain().add(add));
    this.touched = true;
    this.persist();
    return true;
  }

  clearMain() {
    this.setMain(new Decimal(0));
    this.touched = true;
    this.persist();
  }

  addSide(id: string, amount: Decimal): boolean {
    const add = Decimal.min(amount, Decimal.min(this.spare, this.limits.sideMax.sub(this.side.amount(id)))).floor();
    if (add.lte(0)) return false;
    this.side.add(id, add);
    this.touched = true;
    this.persist();
    return true;
  }

  clearSide(id: string) {
    this.side.clear(id);
    this.touched = true;
    this.persist();
  }

  clearAll() {
    this.setMain(new Decimal(0));
    this.side.reset();
    this.touched = true;
    this.persist();
  }

  /** Doubles every bet, up to the table maximums, if the bankroll covers it. */
  double(): boolean {
    const main = Decimal.min(this.getMain().mul(2), this.limits.max);
    const sides = Object.entries(this.side.stakes).map(([id, s]) => [id, Decimal.min(s.mul(2), this.limits.sideMax)] as const);
    const total = sides.reduce((sum, [, s]) => sum.add(s), main.mul(this.mainUnits));
    if (total.lte(this.total) || total.gt(this.bank())) return false;
    this.setMain(main);
    for (const [id, s] of sides) this.side.set(id, s);
    this.touched = true;
    this.persist();
    return true;
  }

  /**
   * Keeps a standing bet playable after a hand: within the bankroll and the
   * room's limits. Short of the room's minimum, the player moves down to a
   * room they can cover.
   */
  fit() {
    floor.stepDownFor(this.bank(), this.mainUnits);
    const { min, max, sideMax } = this.limits;
    if (this.getMain().gt(0)) this.setMain(Decimal.min(Decimal.max(this.getMain(), min), max));
    for (const [id, s] of Object.entries(this.side.stakes)) if (s.gt(sideMax)) this.side.set(id, sideMax);
    if (this.total.gt(this.bank())) {
      const scale = this.bank().div(this.total);
      this.setMain(Decimal.max(this.getMain().mul(scale).floor(), min));
      for (const [id, s] of Object.entries(this.side.stakes)) this.side.set(id, s.mul(scale).floor());
      // Even scaled, the minimum may not leave room for side bets: the main bet comes first.
      if (this.total.gt(this.bank())) this.side.reset();
    }
    this.persist();
  }

  /**
   * Saves this table's bets in the browser under `key`, and brings back the
   * ones saved last time: sit back down and the chips are where you left them.
   */
  remember(key: string) {
    this.key = key;
    const saved = load<{ main: string; sides: Record<string, string> } | null>(`table.${key}`, null);
    try {
      if (saved) {
        this.setMain(new Decimal(saved.main).floor().max(0));
        for (const [id, amount] of Object.entries(saved.sides)) {
          if (id in this.side.stakes) this.side.set(id, new Decimal(amount).floor().max(0));
        }
      }
    } catch {
      // A bad save: the table's opening bets stand.
    }
    this.fit();
  }

  /** Writes the bets to the save now, after a table sets them itself (a buy-back's fresh stake). */
  save() {
    this.touched = false;
    this.fit();
  }

  private persist() {
    const key = this.key;
    if (!key) return;
    saveSoon(`table.${key}`, () => ({
      main: this.getMain().toString(),
      sides: Object.fromEntries(Object.entries(this.side.stakes).map(([id, s]) => [id, s.toString()])),
    }));
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
