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
    name: 'Pai Gow Poker',
    tagline: 'Seven cards, two hands, one joker.',
    blurb:
      'Set your seven cards into a five-card high hand and a two-card low hand. Win both to get paid; split them and it pushes.',
    facts: ['53 cards', 'House way', 'Lots of pushes'],
    motif: ['★', '♠', 'A'],
    accent: '#ffb86b',
    load: () => import('../games/paigow/PaiGowTable.svelte'),
  },
  {
    id: 'lir',
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
    id: 'draw',
    name: 'Draw Poker',
    tagline: 'Keep what you like, redraw the rest.',
    blurb: 'Five cards, one draw, a pay table to chase. Hold rules you configure once and let run.',
    facts: ['Pay table', 'Hold strategy'],
    motif: ['J', '♥', 'Q'],
    accent: '#e8b64c',
  },
];

export function findGame(id: string | null): GameEntry | undefined {
  return GAMES.find((g) => g.id === id);
}
