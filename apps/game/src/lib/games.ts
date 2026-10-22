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
