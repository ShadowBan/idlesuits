import type { Card } from './cards';
import type { HandEval } from './evaluate';
import type { SideBetOwner } from './sidebets';

/** A seat index, or the dealer. */
export type Hand = number | 'dealer';

export type MainOutcome = 'fold' | 'win' | 'lose' | 'push' | 'dealerNoQualify';

/**
 * What happened in a round, in the order the UI should present it.
 * Amounts are in ante units.
 */
export type GameEvent =
  | { type: 'RoundStarted'; round: number; shoeSize: number; seats: number }
  | { type: 'AntePlaced'; seat: number; amount: number }
  | { type: 'SideBetOwnership'; seat: number; betId: string; owner: SideBetOwner; stake: number }
  | { type: 'CardRevealed'; hand: Hand; index: number; card: Card }
  | { type: 'HandEvaluated'; hand: Hand; eval: HandEval }
  | { type: 'RaiseDecided'; seat: number; raise: number }
  | { type: 'DealerQualified'; qualified: boolean }
  | { type: 'MainBetResolved'; seat: number; outcome: MainOutcome; net: number }
  | { type: 'SideBetResolved'; seat: number; betId: string; owner: SideBetOwner; pays: number; net: number }
  | { type: 'RoundSettled'; seat: number; net: number };
