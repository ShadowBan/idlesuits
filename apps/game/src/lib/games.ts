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
    id: 'twentyone',
    name: 'Twenty-One',
    tagline: 'Hit, stand, and try not to bust.',
    blurb: 'The classic race to 21 against the dealer, with an idle strategy table instead of split-second decisions.',
    facts: ['Card counting', 'Splits & doubles'],
    motif: ['A', '♠', '10'],
    accent: '#6be08f',
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
