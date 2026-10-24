export interface C4pRules {
  /** The Super Bonus pays on a straight or better whether or not the player wins. */
  superBonus: { fourAces: number; quads: number; straightFlush: number; trips: number; flush: number; straight: number };
  /** The dealer opens with this high card or better (13 = king). */
  opensHigh: number;
  /** The Play bet may be this many antes with a pair of aces or better; otherwise one. */
  bigPlay: number;
}

/** Shuffle Master's standard rules, as analysed by Wizard of Odds (3.42% per ante). */
export const C4P_RULES: C4pRules = {
  superBonus: { fourAces: 200, quads: 30, straightFlush: 15, trips: 2, flush: 1.5, straight: 1 },
  opensHigh: 13,
  bigPlay: 3,
};
