import {
  evaluateHand,
  type Card,
  type GameEvent,
  type HandEval,
  type RoundResult,
  type SideBetOwner,
} from '@idlesuits/sim';

export type Drama = 'routine' | 'interesting' | 'tense';
export type SpeedMode = '1x' | '2x' | '5x' | 'smart';

export interface Beat {
  event: GameEvent;
  /** How much this beat matters, judged only from what is already on the table. */
  drama: Drama;
}

/** Milliseconds at 1× before each event is shown. */
const BASE_MS: Record<GameEvent['type'], number> = {
  RoundStarted: 250,
  AntePlaced: 120,
  SideBetOwnership: 80,
  CardRevealed: 380,
  HandEvaluated: 250,
  RaiseDecided: 450,
  DealerQualified: 300,
  MainBetResolved: 450,
  SideBetResolved: 300,
  RoundSettled: 500,
};

const SMART_SCALE: Record<Drama, number> = { routine: 0.22, interesting: 1, tense: 2.4 };
const FIXED_SPEED: Record<Exclude<SpeedMode, 'smart'>, number> = { '1x': 1, '2x': 2, '5x': 5 };

/** How long the finished hand stays on the table, so the player can read the result. */
const RESULT_HOLD_MS: Record<Drama, number> = { routine: 1400, interesting: 2200, tense: 3500 };

export function resultHold(drama: Drama, mode: SpeedMode): number {
  if (mode === 'smart') return RESULT_HOLD_MS[drama];
  return 2000 / FIXED_SPEED[mode];
}

export function beatDelay(beat: Beat, mode: SpeedMode): number {
  const base = BASE_MS[beat.event.type];
  if (mode !== 'smart') return base / FIXED_SPEED[mode];
  return base * SMART_SCALE[beat.drama];
}

const RANK: Record<Drama, number> = { routine: 0, interesting: 1, tense: 2 };
const maxDrama = (...d: Drama[]): Drama => d.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'routine');

function playerCardDrama(before: HandEval, left: number, owns: Record<string, SideBetOwner>): Drama {
  const m = before.size;
  const flush: Drama = m >= 5 ? 'tense' : m === 4 ? (left === 1 ? 'tense' : 'interesting') : m === 3 ? 'interesting' : 'routine';
  const straight: Drama =
    owns.superFlushRush !== 'player' ? 'routine' : before.straightFlush >= 4 ? 'tense' : before.straightFlush >= 2 ? 'interesting' : 'routine';
  return maxDrama(flush, straight);
}

function dealerCardDrama(
  before: HandEval,
  left: number,
  player: HandEval | null,
  folded: boolean,
  owns: Record<string, SideBetOwner>,
): Drama {
  let main: Drama = 'routine';
  if (player && !folded) {
    const reach = Math.max(...Object.values(before.suitCounts)) + left;
    const alreadyAhead = before.size > player.size;
    if (!alreadyAhead && reach >= player.size) {
      // Could this very card pull level with the player's flush?
      main = before.size + 1 >= player.size ? 'tense' : left <= 3 ? 'interesting' : 'routine';
    }
  }
  let threat: Drama = 'routine';
  if (owns.flushRush === 'dealer') threat = before.size >= 4 ? 'tense' : before.size === 3 ? 'interesting' : 'routine';
  if (owns.superFlushRush === 'dealer' && before.straightFlush >= 2) threat = maxDrama(threat, before.straightFlush >= 3 ? 'tense' : 'interesting');
  return maxDrama(main, threat);
}

/**
 * The Drama Director. Walks a round's events and rates each one using only the
 * cards revealed so far — never the outcome — so pacing cannot spoil a result.
 * Only the final settle beat looks at the result, after everything is visible.
 */
export function direct(result: RoundResult, seat = 0): Beat[] {
  const revealed: Record<'player' | 'dealer', Card[]> = { player: [], dealer: [] };
  const owns: Record<string, SideBetOwner> = {};
  let playerFinal: HandEval | null = null;
  let folded = false;
  const handSize = result.dealerCards.length;

  return result.events.map((event): Beat => {
    let drama: Drama = 'routine';
    switch (event.type) {
      case 'SideBetOwnership':
        if (event.seat === seat) owns[event.betId] = event.owner;
        break;
      case 'CardRevealed': {
        const who = event.hand === 'dealer' ? 'dealer' : event.hand === seat ? 'player' : null;
        if (!who) break;
        const before = evaluateHand(revealed[who]);
        const left = handSize - revealed[who].length;
        drama =
          who === 'player'
            ? playerCardDrama(before, left, owns)
            : dealerCardDrama(before, left, playerFinal, folded, owns);
        revealed[who].push(event.card);
        break;
      }
      case 'HandEvaluated':
        if (event.hand === seat) playerFinal = event.eval;
        break;
      case 'RaiseDecided':
        if (event.seat === seat) folded = event.raise === 0;
        break;
      case 'RoundSettled':
        drama = Math.abs(event.net) >= 10 ? 'tense' : Math.abs(event.net) >= 3 ? 'interesting' : 'routine';
        break;
    }
    return { event, drama };
  });
}
