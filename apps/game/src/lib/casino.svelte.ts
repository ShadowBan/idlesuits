import { floor } from './floor.svelte';
import { Decimal } from './money';
import { room } from './rooms';
import { load, saveSoon } from './save';
import { tuning } from './tuning.svelte';

const STARTING_BANK = 500;
/** The Main Floor's minimum: below this a player can't sit at any table. */
export const MIN_BET = room(0).min;

function saved(): Decimal {
  try {
    const value = new Decimal(load('bank', String(STARTING_BANK)));
    // A save too small to bet with would sit every table at "Busted": start that player afresh.
    return value.gte(MIN_BET) && value.isFinite() ? value : new Decimal(STARTING_BANK);
  } catch {
    return new Decimal(STARTING_BANK);
  }
}

/**
 * One wallet for the whole casino. Every game draws from and pays into this,
 * so switching tables carries your money with you. Saved in the browser.
 */
export class Bankroll {
  balance = $state(saved());
  /**
   * Too little left for the cheapest table's minimum, and the player has to
   * buy back in. Not just zero: Pai Gow's commission and charm payouts leave cents.
   */
  broke = $derived(this.balance.lt(MIN_BET));

  /** Applies a round's result. Returns the new balance. */
  settle(amount: Decimal): Decimal {
    this.balance = this.balance.add(amount);
    floor.reach(this.balance);
    this.persist();
    return this.balance;
  }

  canAfford(amount: Decimal): boolean {
    return this.balance.gte(amount);
  }

  buyIn(amount: Decimal = new Decimal(tuning.values.buyIn)): void {
    this.balance = amount;
    // A fresh stake starts back on the Main Floor; rooms already opened stay open.
    floor.enter(0);
    this.persist();
  }

  /** Sets the bank outright, for the admin panel. */
  set(amount: Decimal) {
    this.balance = amount.max(0);
    floor.reach(this.balance);
    this.persist();
  }

  private persist() {
    saveSoon('bank', () => this.balance.toString());
  }
}

/** The wallet every table in this session shares. */
export const bankroll = new Bankroll();
floor.reach(bankroll.balance);
