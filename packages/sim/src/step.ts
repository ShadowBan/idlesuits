/**
 * Plays a round up to the next decision the player has not made yet.
 *
 * `run` simulates a whole round, asking `decide` at each decision point and
 * reporting events through `onEvent`. Choices already made are replayed in
 * order; at the first decision with no choice yet, the round stops and that
 * decision is returned along with every event so far. Because each round is
 * seeded, replaying the same choices always deals the same cards, so a UI can
 * pause mid-round without the simulator having to.
 */
export type Stepped<D, E, R> =
  | { kind: 'decision'; events: E[]; decision: D }
  | { kind: 'done'; events: E[]; result: R };

const WAITING = Symbol('waiting-for-player');

export function stepWithChoices<D, C, E, R>(
  run: (decide: (decision: D) => C, onEvent: (event: E) => void) => R,
  choices: readonly C[],
): Stepped<D, E, R> {
  const events: E[] = [];
  let next = 0;
  let pending: D | undefined;

  try {
    const result = run(
      (decision) => {
        if (next < choices.length) return choices[next++]!;
        pending = decision;
        throw WAITING;
      },
      (event) => events.push(event),
    );
    return { kind: 'done', events, result };
  } catch (error) {
    if (error !== WAITING) throw error;
    return { kind: 'decision', events, decision: pending! };
  }
}
