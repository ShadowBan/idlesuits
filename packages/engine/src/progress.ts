import type { PlayerState } from './state';

/** The game's own progress kept in the state: whatever it is, as a plain object. */
export function progressOf(state: PlayerState, game: string): Record<string, unknown> {
  const p = state.games[game];
  return p && typeof p === 'object' && !Array.isArray(p) ? (p as Record<string, unknown>) : {};
}

export function withProgress(state: PlayerState, game: string, progress: Record<string, unknown>): PlayerState {
  return { ...state, games: { ...state.games, [game]: progress } };
}

/** A count kept in a game's progress: its rounds started, say. */
export function counter(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : 0;
}
