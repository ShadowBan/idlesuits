import type { ThreeCardHand } from '../three';

export interface TcpRules {
  /** Paid on the Ante for a straight or better whenever the player plays, win or lose. */
  anteBonus: Partial<Record<ThreeCardHand, number>>;
  /** The dealer qualifies with this high card or better (12 = queen). */
  qualifyHigh: number;
}

/** Wizard of Odds Ante Bonus pay table 1, which "the vast majority of tables follow" (3.37%). */
export const TCP_RULES: TcpRules = {
  anteBonus: { miniRoyal: 5, straightFlush: 5, trips: 4, straight: 1 },
  qualifyHigh: 12,
};
