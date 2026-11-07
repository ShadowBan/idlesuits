export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'secret';
export const RARITIES: readonly Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'secret'];

/** A value that grows with a charm's level, from level 1 to the top level. */
export interface Scale {
  min: number;
  max: number;
}

/**
 * What a charm does when a hand settles. Cash amounts are in units of the
 * round's base bet (the ante, or the blackjack bet); "stake" amounts are a
 * fraction of what was staked.
 */
export type Effect =
  /** All Tokens earned this hand × (1 + v). */
  | { kind: 'tokenPct'; v: Scale }
  /** v Tokens every hand, win or lose. */
  | { kind: 'tokenPerHand'; v: Scale }
  /** v Tokens on a lost or folded hand. */
  | { kind: 'tokenOnLoss'; v: Scale }
  /** Winning bets at minOdds or longer earn v more Tokens (a fraction). */
  | { kind: 'longshotTokens'; minOdds: number; v: Scale }
  /** Chance v that this hand's Tokens are doubled. */
  | { kind: 'tokenDouble'; v: Scale }
  /** v of everything wagered comes back, win or lose: the casino's comps. */
  | { kind: 'comp'; v: Scale }
  /** v of the stake on side bets that missed comes back. */
  | { kind: 'sideRefund'; v: Scale }
  /** A push pays v of the main stake. */
  | { kind: 'pushPay'; v: Scale }
  /** A final hand of category minTier or better pays v units (not after a fold). */
  | { kind: 'tierBonus'; minTier: number; v: Scale }
  /** A flush or better (or a big flush at Idle Suits) pays v units. */
  | { kind: 'flushBonus'; v: Scale }
  /** A win straight after a loss pays v units. */
  | { kind: 'comeback'; v: Scale }
  /** A win pays v units for every win before it in a row, up to five. */
  | { kind: 'streak'; v: Scale }
  /** Chance v that a losing hand refunds `refund` of the main stake lost. */
  | { kind: 'lossShield'; refund: number; v: Scale }
  /** After three losses in a row, the next loss refunds v of the main stake lost. */
  | { kind: 'losingStreakShield'; v: Scale }
  /** A blackjack pays v units more. */
  | { kind: 'blackjackBonus'; v: Scale }
  /** Winning bets at minOdds or longer pay v of their winnings again. */
  | { kind: 'bigHit'; minOdds: number; v: Scale }
  /** Chance v that a winning hand's winnings are paid twice. */
  | { kind: 'doubleWin'; v: Scale }
  /** v Tokens for every gem a slot spin drops into the pots. */
  | { kind: 'gemTokens'; v: Scale }
  /** v Tokens for a slot spin one symbol short of the bonus. */
  | { kind: 'nearMissTokens'; v: Scale }
  /**
   * Slot effects, read by the slot machines as each spin plays rather than
   * when it settles (see `slotCharms`).
   */
  /** One short of the bonus, chance v a reel nudges a step to bring it in. */
  | { kind: 'slotNudge'; v: Scale }
  /** As the bonus starts, chance v each pot that isn't full fills anyway. */
  | { kind: 'slotFill'; v: Scale }
  /** Chance v a spin turns one of reels 2–4 wild. */
  | { kind: 'slotWild'; v: Scale }
  /** Chance v the bonus plays again once it ends. */
  | { kind: 'slotEncore'; v: Scale }
  /**
   * Rule-bending effects, read by the tables rather than when a hand settles.
   * Their values are whole numbers by level, not a scale.
   */
  /** Extra hands dealt blind beside the player's own at the poker tables. */
  | { kind: 'extraHands'; perLevel: number[] }
  /** Decks taken out of a multi-deck shoe: fewer decks, better odds. */
  | { kind: 'fewerDecks'; perLevel: number[] };

/** The effects a table reads for its rules. */
export type RuleEffect = Extract<Effect, { perLevel: number[] }>;

/** The effects a slot machine reads as it spins. */
export type SlotEffect = Extract<Effect, { kind: 'slotNudge' | 'slotFill' | 'slotWild' | 'slotEncore' }>;

export interface CharmDef {
  id: string;
  name: string;
  rarity: Rarity;
  /** One line of folklore, shown under the name. */
  flavor: string;
  effects: Effect[];
  /** Only where the condition can happen: "Poker games", "Blackjack". */
  where?: string;
  /** Below the usual ten: a Secret charm tops out after a level or two. */
  maxLevel?: number;
}

export interface CharmSet {
  id: string;
  name: string;
  members: [string, string, string];
  /** Applies while all three are equipped, at the level of the lowest. */
  bonus: Effect[];
  blurb: string;
}

/** One bet's part in a settled hand, in units of the round's base bet. */
export interface ReportBet {
  kind: 'main' | 'side';
  stake: number;
  net: number;
}

/**
 * What a table tells the casino when a hand settles: enough for any charm to
 * act on it without knowing the game.
 */
export interface RoundReport {
  game: string;
  /** For seeded chances: the table's run seed and round number. */
  seed: { run: string; round: number };
  bets: ReportBet[];
  /** The main game's result, side bets aside. */
  outcome: 'win' | 'lose' | 'push' | 'fold';
  /** The player's final hand as a five-card poker category (0 high card … 9 royal), where there is one. */
  tier?: number;
  /** A big flush at a game whose hands are not poker hands (Idle Suits). */
  flush?: boolean;
  blackjack?: boolean;
  /** A slot spin: gems it dropped into the pots, and whether it came one symbol short of the bonus. */
  gems?: number;
  nearMiss?: boolean;
}

/** Streaks carried from hand to hand, across every table. */
export interface CharmRunState {
  winStreak: number;
  lossStreak: number;
  lastOutcome: RoundReport['outcome'] | null;
}

export interface Equipped {
  id: string;
  level: number;
}

/** A charm (or a set) doing something this hand, for the table to show. */
export interface CharmTrigger {
  /** A charm id, or `set:<id>` for a set bonus. */
  source: string;
  name: string;
  cash: number;
  tokens: number;
}

export interface CharmOutcome {
  /** Extra cash, in units of the base bet. */
  cash: number;
  /** Tokens earned, charms included. */
  tokens: number;
  /** Tokens the win earned on its own, before any charm. */
  baseTokens: number;
  triggers: CharmTrigger[];
  state: CharmRunState;
}
