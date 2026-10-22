import { standardDeck, type Card } from '../cards';
import { Category, comparePoker, evaluatePoker, type PokerHand } from '../poker';
import { Rng, type Seed } from '../rng';
import { payOf, UTH_RULES, type UthRules } from './rules';

/** What the player may do at a decision point. */
export type UthMove = 'check' | 'fold' | 'raise';

export type Street = 'preflop' | 'flop' | 'river';

export interface UthDecision {
  street: Street;
  hole: Card[];
  /** Community cards face up so far: none, then three, then five. */
  board: Card[];
  /** Play bet sizes allowed here, in antes. Empty means only check or fold. */
  raises: number[];
  /** Folding is only possible on the river. */
  canCheck: boolean;
  canFold: boolean;
}

export type UthEvent =
  | { type: 'RoundStarted'; round: number; ante: number; trips: number }
  | { type: 'HoleCards'; cards: Card[] }
  | { type: 'DealerCards' }
  | { type: 'Decision'; street: Street }
  | { type: 'Played'; street: Street; raise: number }
  | { type: 'Checked'; street: Street }
  | { type: 'Folded' }
  | { type: 'BoardRevealed'; street: Street; cards: Card[] }
  | { type: 'DealerRevealed'; cards: Card[]; hand: PokerHand; qualified: boolean }
  | { type: 'PlayerHand'; hand: PokerHand }
  | { type: 'Settled'; part: 'ante' | 'play' | 'blind' | 'trips'; net: number; note: string }
  | { type: 'RoundSettled'; net: number };

export interface UthSeed {
  run: Seed;
  round: number;
}

export interface UthRoundInput {
  rules?: UthRules;
  seed: UthSeed;
  /** Trips side bet, in antes. Zero leaves it off. */
  trips?: number;
  /** Forces the player's hole cards, for deriving strategy over fixed holdings. */
  hole?: readonly Card[];
  decide: (decision: UthDecision) => { move: UthMove; raise?: number };
  recordEvents?: boolean;
  onEvent?: (event: UthEvent) => void;
}

export interface UthRoundResult {
  hole: Card[];
  board: Card[];
  dealer: Card[];
  playerHand: PokerHand;
  dealerHand: PokerHand;
  dealerQualified: boolean;
  folded: boolean;
  /** Play bet in antes; zero if the player folded. */
  play: number;
  /** Everything won or lost, in antes. */
  net: number;
  parts: { ante: number; play: number; blind: number; trips: number };
  events: UthEvent[];
}

export function simulateUthRound(input: UthRoundInput): UthRoundResult {
  const rules = input.rules ?? UTH_RULES;
  const events: UthEvent[] = [];
  const emit = (event: UthEvent) => {
    if (input.recordEvents) events.push(event);
    input.onEvent?.(event);
  };

  const rng = new Rng(input.seed.run, 'uth', input.seed.round);
  const deck = standardDeck('player');
  let next = 0;
  const draw = (): Card => {
    const j = next + rng.int(deck.length - next);
    const card = deck[j]!;
    deck[j] = deck[next]!;
    deck[next] = card;
    next++;
    return card;
  };

  const trips = input.trips ?? 0;
  emit({ type: 'RoundStarted', round: input.seed.round, ante: 1, trips });

  if (input.hole) {
    // Lift the chosen cards out of the deck so the rest of the deal is honest.
    const wanted = new Set(input.hole.map((c) => `${c.rank}${c.suit}`));
    for (let i = deck.length - 1; i >= 0; i--) {
      if (wanted.has(`${deck[i]!.rank}${deck[i]!.suit}`)) deck.splice(i, 1);
    }
  }
  const hole = input.hole ? [...input.hole] : [draw(), draw()];
  const dealer = [draw(), draw()];
  const board = [draw(), draw(), draw(), draw(), draw()];
  emit({ type: 'HoleCards', cards: hole });
  emit({ type: 'DealerCards' });

  let play = 0;
  let folded = false;

  const ask = (street: Street, raises: number[], canFold: boolean): void => {
    emit({ type: 'Decision', street });
    const shown = street === 'preflop' ? [] : street === 'flop' ? board.slice(0, 3) : board;
    const choice = input.decide({ street, hole, board: shown, raises, canCheck: !canFold, canFold });
    if (choice.move === 'fold') {
      folded = true;
      emit({ type: 'Folded' });
      return;
    }
    if (choice.move === 'raise') {
      const raise = choice.raise ?? raises[0]!;
      play = raises.includes(raise) ? raise : raises[0]!;
      emit({ type: 'Played', street, raise: play });
      return;
    }
    emit({ type: 'Checked', street });
  };

  ask('preflop', rules.preflopRaises, false);
  if (play === 0) {
    emit({ type: 'BoardRevealed', street: 'flop', cards: board.slice(0, 3) });
    ask('flop', [rules.flopRaise], false);
  }
  if (play === 0 && !folded) {
    emit({ type: 'BoardRevealed', street: 'river', cards: board.slice(3) });
    ask('river', [rules.riverRaise], true);
  } else if (play > 0) {
    // The rest of the board is dealt out with no further betting.
    emit({ type: 'BoardRevealed', street: 'flop', cards: board.slice(0, 3) });
    emit({ type: 'BoardRevealed', street: 'river', cards: board.slice(3) });
  }

  const playerHand = evaluatePoker([...hole, ...board]);
  const dealerHand = evaluatePoker([...dealer, ...board]);
  const dealerQualified = dealerHand.category >= rules.qualifies;
  emit({ type: 'PlayerHand', hand: playerHand });
  emit({ type: 'DealerRevealed', cards: dealer, hand: dealerHand, qualified: dealerQualified });

  const parts = { ante: 0, play: 0, blind: 0, trips: 0 };

  // The Trips bet rides on the player's own hand, even if they folded.
  if (trips > 0) {
    const pays = payOf(rules.tripsPays, playerHand.category);
    parts.trips = pays > 0 ? pays * trips : -trips;
    emit({ type: 'Settled', part: 'trips', net: parts.trips, note: pays > 0 ? `pays ${pays}:1` : 'miss' });
  }

  if (folded) {
    parts.ante = -1;
    parts.blind = -1;
    emit({ type: 'Settled', part: 'ante', net: -1, note: 'folded' });
    emit({ type: 'Settled', part: 'blind', net: -1, note: 'folded' });
  } else {
    const cmp = comparePoker(playerHand, dealerHand);

    if (!dealerQualified) {
      emit({ type: 'Settled', part: 'ante', net: 0, note: 'dealer does not qualify' });
    } else if (cmp > 0) {
      parts.ante = 1;
      emit({ type: 'Settled', part: 'ante', net: 1, note: 'win' });
    } else if (cmp < 0) {
      parts.ante = -1;
      emit({ type: 'Settled', part: 'ante', net: -1, note: 'lose' });
    } else {
      emit({ type: 'Settled', part: 'ante', net: 0, note: 'tie' });
    }

    parts.play = cmp > 0 ? play : cmp < 0 ? -play : 0;
    emit({ type: 'Settled', part: 'play', net: parts.play, note: cmp > 0 ? 'win' : cmp < 0 ? 'lose' : 'tie' });

    // The Blind pays on a winning hand of a straight or better, and pushes below that.
    const pays = payOf(rules.blindPays, playerHand.category);
    parts.blind = cmp > 0 ? pays : cmp < 0 ? -1 : 0;
    emit({
      type: 'Settled',
      part: 'blind',
      net: parts.blind,
      note: cmp > 0 ? (pays > 0 ? `pays ${pays}:1` : 'push') : cmp < 0 ? 'lose' : 'tie',
    });
  }

  const net = parts.ante + parts.play + parts.blind + parts.trips;
  emit({ type: 'RoundSettled', net });

  return { hole, board, dealer, playerHand, dealerHand, dealerQualified, folded, play, net, parts, events };
}

export { Category };
