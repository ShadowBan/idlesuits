import type { Card } from '../cards';
import type { BjEvent, BjHand, BjRoundInput, BjRoundResult } from './round';
import { simulateBjRound } from './round';
import { decideMove, type Allowed, type Move, type StrategyTables } from './strategy';

export interface Decision {
  handIndex: number;
  hand: BjHand;
  upcard: Card;
  allowed: Allowed;
  /** What the solved chart would do here. */
  suggestion: Move;
  /** A free-bet hand plays for wins, since it cannot lose. */
  regime: 'real' | 'free';
}

export type Step =
  | { kind: 'decision'; events: BjEvent[]; decision: Decision }
  | { kind: 'done'; events: BjEvent[]; result: BjRoundResult };

const NEEDS_PLAYER = Symbol('needs-player');

/**
 * Plays a round up to the point where the player must choose, replaying the
 * moves already made. The seed fixes the shoe, so replaying a prefix always
 * deals the same cards — which is what lets a decision be made in the UI
 * without the simulator having to pause mid-round.
 */
export function stepRound(input: BjRoundInput, moves: readonly Move[]): Step {
  const events: BjEvent[] = [];
  let next = 0;
  let pending: Decision | null = null;

  const run = (tables: StrategyTables): BjRoundResult =>
    simulateBjRound({
      ...input,
      recordEvents: false,
      onEvent: (event) => events.push(event),
      decide: (hand, handIndex, upcard, allowed) => {
        if (next < moves.length) return moves[next++]!;
        pending = {
          handIndex,
          hand,
          upcard,
          allowed,
          regime: hand.bet > 0 ? 'real' : 'free',
          suggestion: decideMove(tables, hand.bet > 0 ? 'real' : 'free', hand.cards, upcard, allowed),
        };
        throw NEEDS_PLAYER;
      },
    });

  try {
    return { kind: 'done', events, result: run(input.tables) };
  } catch (error) {
    if (error !== NEEDS_PLAYER) throw error;
    return { kind: 'decision', events, decision: pending! };
  }
}
