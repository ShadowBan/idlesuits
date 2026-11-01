import type { Card, Rank } from '../cards';

export interface BaccaratRules {
  decks: number;
  /** Taken from a winning Banker bet: 0.05 pays it 0.95 to 1. */
  commission: number;
}

/** Punto Banco as dealt in most casinos: eight decks, 5% commission on Banker wins. */
export const BACCARAT_RULES: BaccaratRules = {
  decks: 8,
  commission: 0.05,
};

/** Tens and faces count nothing, an ace one, everything else its pips. */
export function baccaratValue(rank: Rank): number {
  return rank >= 10 && rank <= 13 ? 0 : rank === 14 ? 1 : rank;
}

/** A hand's total: the last digit of its cards' sum. */
export function baccaratTotal(cards: readonly Card[]): number {
  return cards.reduce((sum, c) => sum + baccaratValue(c.rank), 0) % 10;
}

/** The Player draws a third card on 0-5 and stands on 6 or 7. */
export function playerDraws(total: number): boolean {
  return total <= 5;
}

/**
 * The Banker's tableau. If the Player stood, the Banker draws on 0-5 like the
 * Player. Otherwise it depends on the Player's third card (its value).
 */
export function bankerDraws(total: number, playerThird: number | null): boolean {
  if (playerThird === null) return total <= 5;
  switch (total) {
    case 0:
    case 1:
    case 2:
      return true;
    case 3:
      return playerThird !== 8;
    case 4:
      return playerThird >= 2 && playerThird <= 7;
    case 5:
      return playerThird >= 4 && playerThird <= 7;
    case 6:
      return playerThird === 6 || playerThird === 7;
    default:
      return false;
  }
}
