import type { Component } from 'svelte';

export interface GameProps {
  /** Returns to the lobby. */
  onExit: () => void;
}

export interface GameEntry {
  /** Also the route: #/<id>. */
  id: string;
  name: string;
  /** One line under the name in the lobby. */
  tagline: string;
  /** What the player does, in a sentence or two. */
  blurb: string;
  /** Short facts shown as chips on the lobby card. */
  facts: string[];
  /** Suit symbols or pips drawn on the card's face. */
  motif: string[];
  accent: string;
  /**
   * Decks dealt from, as the game is dealt in a casino: a multi-deck shoe for
   * blackjack, one deck reshuffled every hand for the carnival games. Only a
   * shoe of more than one deck can be changed by a charm.
   */
  decks: number;
  /** The deck carries a joker (Pai Gow, DJ Wild). */
  joker?: boolean;
  /** How the game is dealt when it isn't from cards (roulette's wheel), for its lobby card. */
  dealt?: string;
  /** Loaded only when the table is opened, so the lobby stays small. */
  load?: () => Promise<{ default: Component<GameProps> }>;
}

/**
 * Every table on the floor. A new game is a folder under `src/games/` plus an
 * entry here; nothing else in the shell needs to know about it.
 */
export const GAMES: GameEntry[] = [
  {
    id: 'suits',
    decks: 1,
    name: 'Idle Suits',
    tagline: 'Seven cards. Biggest flush takes it.',
    blurb:
      'You and the dealer each get seven cards. The most cards of one suit wins, and side bets pay on your hand alone.',
    facts: ['7 cards', '2 side bets', 'Auto play'],
    motif: ['♠', '♥', '♦', '♣'],
    accent: '#5cc8ff',
    load: () => import('../games/suits/SuitsGame.svelte'),
  },
  {
    id: 'blackjack',
    decks: 6,
    name: 'Free Bet Blackjack',
    tagline: 'The house pays for your doubles and splits.',
    blurb:
      'Blackjack where doubles on 9, 10 and 11 and every split but tens ride on the house. In exchange, a dealer 22 pushes.',
    facts: ['Free doubles', 'Free splits', 'Dealer 22 pushes'],
    motif: ['A', '♠', '10'],
    accent: '#6be08f',
    load: () => import('../games/blackjack/BlackjackGame.svelte'),
  },
  {
    id: 'uth',
    decks: 1,
    name: "Ultimate Texas Hold'em",
    tagline: 'Bet big early, or pay less to see more.',
    blurb:
      'Two cards each and five on the board. Raise 4× before the flop on a strong hand, 2× on the flop, or 1× at the end.',
    facts: ['Ante + Blind', 'Trips side bet', 'River odds'],
    motif: ['K', '♥', 'K'],
    accent: '#ff7a66',
    load: () => import('../games/uth/UthTable.svelte'),
  },
  {
    id: 'stud',
    decks: 1,
    name: 'Mississippi Stud',
    tagline: 'No dealer. Just you and the pay table.',
    blurb:
      'Two cards of your own and three shared. Raise 1× or 3× as each card lands, and every bet pays at the same odds.',
    facts: ['Up to 10× ante', 'Royal pays 500:1', 'No dealer'],
    motif: ['J', '♦', 'J'],
    accent: '#c792ea',
    load: () => import('../games/stud/StudTable.svelte'),
  },
  {
    id: 'tcp',
    decks: 1,
    name: 'Three Card Poker',
    tagline: 'Three cards. Play or fold.',
    blurb:
      'You and the dealer get three cards each. Play if yours look stronger; straights and better earn a bonus either way.',
    facts: ['Ante bonus', 'Pairplus', 'Q-6-4 strategy'],
    motif: ['Q', '♣', '6'],
    accent: '#7ee0d2',
    load: () => import('../games/tcp/TcpTable.svelte'),
  },
  {
    id: 'paigow',
    decks: 1,
    joker: true,
    name: 'Pai Gow Poker',
    tagline: 'Seven cards, two hands, one joker.',
    blurb:
      'Set your seven cards into a five-card high hand and a two-card low hand. Win both to get paid; split them and it pushes.',
    facts: ['House way', 'Lots of pushes'],
    motif: ['★', '♠', 'A'],
    accent: '#ffb86b',
    load: () => import('../games/paigow/PaiGowTable.svelte'),
  },
  {
    id: 'lir',
    decks: 1,
    name: 'Let It Ride',
    tagline: 'Three bets down. Take some back.',
    blurb:
      'Three cards of your own and two shared. Pull back a bet before each shared card, or let it ride to the pay table.',
    facts: ['No dealer', 'Pull bets back', 'Royal pays 1000:1'],
    motif: ['10', '♠', '10'],
    accent: '#9be36d',
    load: () => import('../games/lir/LirTable.svelte'),
  },
  {
    id: 'csp',
    decks: 1,
    name: 'Caribbean Stud',
    tagline: 'Five cards. One dealer card showing.',
    blurb:
      'Five cards each, with one of the dealer’s face up. Raise to play on; a royal flush pays the raise 100:1.',
    facts: ['Raise 2×', 'Ace-king qualifies', 'Up card strategy'],
    motif: ['A', '♥', 'K'],
    accent: '#5fd3f0',
    load: () => import('../games/csp/CspTable.svelte'),
  },
  {
    id: 'c4p',
    decks: 1,
    name: 'Crazy 4 Poker',
    tagline: 'Best four of five.',
    blurb:
      'Five cards each, best four play. Bet up to 3× with aces or better, and the Super Bonus pays any straight or better.',
    facts: ['Best 4 of 5', 'Super Bonus', 'Up to 3× play'],
    motif: ['4', '♦', '4'],
    accent: '#f78fb3',
    load: () => import('../games/c4p/C4pTable.svelte'),
  },
  {
    id: 'djwild',
    decks: 1,
    joker: true,
    name: 'DJ Wild',
    tagline: 'Deuces and the joker are wild.',
    blurb:
      'Five cards each from 53, with five wild cards in the deck. Play 2× or fold; a winning straight or better pays the Blind.',
    facts: ['5 wild cards', 'No qualifier', 'Blind up to 1000:1'],
    motif: ['2', '★', '2'],
    accent: '#c3a6ff',
    load: () => import('../games/djw/DjTable.svelte'),
  },
  {
    id: 'baccarat',
    decks: 8,
    name: 'Baccarat',
    tagline: 'Player or Banker. Closest to nine.',
    blurb:
      'Back the Player or the Banker. The cards are dealt by fixed rules, and the hand closest to nine wins. Banker pays a little less but wins more often.',
    facts: ['No decisions', 'Banker 1.06% edge', 'Scoreboard'],
    motif: ['P', '9', 'B'],
    accent: '#ff9f6e',
    load: () => import('../games/baccarat/BaccaratTable.svelte'),
  },
  {
    id: 'roulette',
    decks: 0,
    dealt: 'Single-zero wheel',
    name: 'Single Zero Roulette',
    tagline: 'Place your bets. The ball picks one.',
    blurb:
      'Lay chips on numbers, the lines between them, or red, black, odd, even, the dozens and columns. Every bet covering the number the ball lands on pays: 35:1 straight up, down to even money.',
    facts: ['37 pockets', 'Every bet 2.70%', 'Auto play'],
    motif: ['17', '0', '32'],
    accent: '#ff5a5a',
    load: () => import('../games/roulette/RouletteTable.svelte'),
  },
  {
    id: 'draw',
    decks: 1,
    name: 'Draw Poker',
    tagline: 'Keep what you like, redraw the rest.',
    blurb: 'Five cards, one draw, a pay table to chase. Hold rules you configure once and let run.',
    facts: ['Pay table', 'Hold strategy'],
    motif: ['J', '♥', 'Q'],
    accent: '#e8b64c',
  },
];

/** A machine on the slot floor. Its route is #/<id>, as a table's is. */
export interface SlotEntry {
  id: string;
  name: string;
  tagline: string;
  blurb: string;
  /** The feature it's built around, shown on its lobby card. */
  feature: string;
  /** Drawn on the card's face, as a reel's worth of symbols. */
  motif: string[];
  facts: string[];
  accent: string;
  load?: () => Promise<{ default: Component<GameProps> }>;
}

/**
 * The slot floor: original machines on one shared slot engine
 * (`packages/sim/src/slots`), each built around a feature of its own.
 */
export const SLOTS: SlotEntry[] = [
  {
    id: 'vault',
    name: 'Midnight Vault',
    tagline: 'Six coins crack the vault.',
    blurb:
      'Five reels, 243 ways. Land six gold coins for hold & spin: coins stick, every new one resets the respins, and a full screen wins the Grand. Three pots of gems boost it: all three is the Super.',
    feature: 'Hold & spin',
    motif: ['$', '●', '$'],
    facts: ['243 ways', '4 jackpots', 'Linked progressive'],
    accent: '#f2c64e',
    load: () => import('../games/slots/SlotTable.svelte'),
  },
  {
    id: 'forge',
    name: 'Lucky Forge',
    tagline: 'Bronze to silver to gold to crown.',
    blurb:
      'Three anvils start free spins. Every three hammers strike the forge and every horseshoe moves up a tier, with extra spins. A screen of crowns wins the Grand. Embers fill three pots: 2× wilds, more spins, a head start.',
    feature: 'Upgrading symbols',
    motif: ['⚒', '♛', '⚒'],
    facts: ['243 ways', 'Free spins', 'Up to 4 tiers'],
    accent: '#ff8a4c',
    load: () => import('../games/slots/SlotTable.svelte'),
  },
  {
    id: 'haul',
    name: "Pirate's Haul",
    tagline: 'The captain takes every coin.',
    blurb:
      'Doubloons land with cash or a jackpot on them, and a captain on reel 5 takes them all. In free spins every fifth captain adds spins and raises the multiplier to 10×. Three pots add a head start, more spins and double doubloons.',
    feature: 'Collector',
    motif: ['●', '☠', '●'],
    facts: ['243 ways', 'Cash on reels', 'Up to 10×'],
    accent: '#4cc9b0',
    load: () => import('../games/slots/SlotTable.svelte'),
  },
  {
    id: 'carnival',
    name: 'Carnival Crown',
    tagline: 'Step right up. Climb the wheel.',
    blurb:
      'Three wheel tickets spin the carnival wheel for cash and jackpots. Land Up and climb to the next wheel in, all the way to the crown wheel and its Grand. Three pots add Up wedges, a multiplier ring and a second spin.',
    feature: 'Wheel bonus',
    motif: ['◎', '▲', '◎'],
    facts: ['243 ways', '3 wheels', '4 jackpots'],
    accent: '#e8344f',
    load: () => import('../games/slots/SlotTable.svelte'),
  },
  {
    id: 'lanterns',
    name: 'Paper Lanterns',
    tagline: 'Match three, win the jackpot.',
    blurb:
      'Three lanterns start the jackpot pick: twelve lanterns hide three of each jackpot. Open them one by one until a jackpot shows three times. Three pots add a second board, clear the Mini and raise the jackpot.',
    feature: 'Jackpot pick',
    motif: ['◉', '◉', '◉'],
    facts: ['243 ways', 'Pick to match', '4 jackpots'],
    accent: '#ff7a3a',
    load: () => import('../games/slots/SlotTable.svelte'),
  },
];

/** How the game is dealt, for its lobby card: "6-deck shoe", "1 deck + joker". */
export function deckLabel(game: GameEntry): string {
  if (game.dealt) return game.dealt;
  if (game.decks > 1) return `${game.decks}-deck shoe`;
  return game.joker ? '1 deck + joker' : '1 deck';
}

/** A table or a machine by its route id. */
/** An instant game: no cards, no reels, one quick decision at a time. Its route is #/<id>. */
export interface InstantEntry {
  id: string;
  name: string;
  tagline: string;
  blurb: string;
  /** What kind of game it is, for its lobby card. */
  kind: string;
  /** Drawn on the card's face. */
  motif: string[];
  facts: string[];
  accent: string;
  load?: () => Promise<{ default: Component<GameProps> }>;
}

/**
 * The instant games (`packages/sim/src/instant`): the quick press-your-luck
 * games online casinos run beside their slots, each with an exact payback the
 * pit boss sets.
 */
export const INSTANT: InstantEntry[] = [
  {
    id: 'mines',
    name: 'Dynamite Dig',
    tagline: 'Dig for gems. Don’t hit the dynamite.',
    blurb:
      'Choose how much dynamite is buried in a field of 25 squares, then dig. Every gem raises the cash-out, a star raises it twice as much, and you can take the money after any dig.',
    kind: 'Mines',
    motif: ['◆', '★', '✸'],
    facts: ['1–24 sticks', 'Cash out any time'],
    accent: '#5fd0ff',
    load: () => import('../games/instant/MinesTable.svelte'),
  },
  {
    id: 'deepdrop',
    name: 'Deep Drop',
    tagline: 'The deeper the hook, the bigger the catch.',
    blurb:
      'Drop a line into the deep. The multiplier climbs as the hook sinks, until something down there bites through the line. Reel in before it does. One line in 30 drops golden and pays double.',
    kind: 'Crash',
    motif: ['⚓', '≈', '⤓'],
    facts: ['Up to 10,000×', 'Golden lines'],
    accent: '#2fc4b2',
    load: () => import('../games/instant/CrashTable.svelte'),
  },
  {
    id: 'plinko',
    name: 'Lucky Drop',
    tagline: 'Drop the ball. Hope it strays.',
    blurb:
      'Balls bounce down through the pegs into the slots below. The edges pay the most, the middle pays least, even less than the ball. Choose 8, 12 or 16 rows and how wild the edges get.',
    kind: 'Plinko',
    motif: ['●', '∴', '▾'],
    facts: ['3 boards', 'Up to 1,000×'],
    accent: '#ff7ad9',
    load: () => import('../games/instant/PlinkoTable.svelte'),
  },
  {
    id: 'keno',
    name: 'Golden Keno',
    tagline: 'Mark your numbers. Catch the gold ball.',
    blurb:
      'Mark up to ten numbers of 80, then twenty balls are drawn. The more of yours come up, the more the ticket pays. The last ball is gold: catch it and the win is tripled.',
    kind: 'Keno',
    motif: ['7', '23', '61'],
    facts: ['1–10 spots', 'Gold ball ×3'],
    accent: '#e8c06a',
    load: () => import('../games/instant/KenoTable.svelte'),
  },
];

export function findGame(id: string | null): GameEntry | SlotEntry | InstantEntry | undefined {
  return GAMES.find((g) => g.id === id) ?? SLOTS.find((s) => s.id === id) ?? INSTANT.find((g) => g.id === id);
}
