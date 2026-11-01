import type { Card } from '../cards';
import type { BjEvent, BjHand, BjRoundInput, BjRoundResult } from './round';
import { simulateBjRound } from './round';
import { decideMove, type Allowed, type Move, type StrategyTables } from './strategy';

/** Taking insurance or not, asked before any move when the dealer shows an ace. */
export type InsuranceChoice = 'insure' | 'noInsurance';
export type BjChoice = Move | InsuranceChoice;

export interface Decision {
  /** A move on a hand, or whether to insure against a dealer ace. */
  kind: 'move' | 'insurance';
  handIndex: number;
  hand: BjHand;
  upcard: Card;
  allowed: Allowed;
  /** What the solved chart would do here. Basic strategy never insures. */
  suggestion: BjChoice;
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
export function stepRound(input: BjRoundInput, moves: readonly BjChoice[]): Step {
  const events: BjEvent[] = [];
  let next = 0;
  let pending: Decision | null = null;

  const run = (tables: StrategyTables): BjRoundResult =>
    simulateBjRound({
      ...input,
      recordEvents: false,
      onEvent: (event) => events.push(event),
      insure: (hand, upcard) => {
        if (next < moves.length) return moves[next++] === 'insure';
        pending = {
          kind: 'insurance',
          handIndex: 0,
          hand,
          upcard,
          allowed: { double: false, split: false },
          regime: 'real',
          suggestion: 'noInsurance',
        };
        throw NEEDS_PLAYER;
      },
      decide: (hand, handIndex, upcard, allowed) => {
        if (next < moves.length) return moves[next++] as Move;
        pending = {
          kind: 'move',
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
