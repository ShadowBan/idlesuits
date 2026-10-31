import { Decimal } from './money';
import { load, saveSoon } from './save';

const STARTING_BANK = 500;
/** The smallest chip: below this a player can't place a bet anywhere. */
export const MIN_BET = 1;

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
   * Too little left for even the smallest chip, and the player has to buy
   * back in. Not just zero: Pai Gow's commission and charm payouts leave cents.
   */
  broke = $derived(this.balance.lt(MIN_BET));

  /** Applies a round's result. Returns the new balance. */
  settle(amount: Decimal): Decimal {
    this.balance = this.balance.add(amount);
    this.persist();
    return this.balance;
  }

  canAfford(amount: Decimal): boolean {
    return this.balance.gte(amount);
  }

  buyIn(amount: Decimal = new Decimal(STARTING_BANK)): void {
    this.balance = amount;
    this.persist();
  }

  private persist() {
    saveSoon('bank', () => this.balance.toString());
  }
}

/** The wallet every table in this session shares. */
export const bankroll = new Bankroll();
