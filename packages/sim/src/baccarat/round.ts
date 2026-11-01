import { settleBonuses, type BonusResult } from '../bonus';
import { standardDeck, type Card } from '../cards';
import { Rng, type Seed } from '../rng';
import { BACCARAT_BONUSES, type BaccaratWinner } from './bonus';
import { BACCARAT_RULES, baccaratTotal, baccaratValue, bankerDraws, playerDraws, type BaccaratRules } from './rules';

/** Which hand the main bet backs. */
export type BaccaratSide = 'player' | 'banker';
export type BaccaratHand = 'player' | 'banker';

export type BaccaratEvent =
  | { type: 'RoundStarted'; round: number; side: BaccaratSide; bonuses: Record<string, number> }
  | { type: 'CardDealt'; to: BaccaratHand; index: number; card: Card; total: number }
  | { type: 'Natural'; hand: BaccaratHand | 'both'; total: number }
  | { type: 'Winner'; winner: BaccaratWinner; player: number; banker: number }
  | { type: 'MainSettled'; net: number; note: string }
  | { type: 'BonusSettled'; result: BonusResult }
  | { type: 'RoundSettled'; net: number };

export interface BaccaratRoundInput {
  rules?: BaccaratRules;
  seed: { run: Seed; round: number };
  side: BaccaratSide;
  /** Side bets by id (see BACCARAT_BONUSES), in units of the main bet. Missing or zero is off. */
  bonuses?: Readonly<Record<string, number>>;
  /** Deal from this shoe, starting at `next`, instead of a fresh shuffle. The seed is then unused. */
  shoe?: { readonly cards: readonly Card[]; readonly next: number };
  recordEvents?: boolean;
  onEvent?: (event: BaccaratEvent) => void;
}

export interface BaccaratRoundResult {
  player: Card[];
  banker: Card[];
  playerTotal: number;
  bankerTotal: number;
  winner: BaccaratWinner;
  /** Either hand made 8 or 9 on its first two cards. */
  natural: boolean;
  /** The main bet's result, in units of itself. */
  main: number;
  bonuses: BonusResult[];
  net: number;
  cardsUsed: number;
  events: BaccaratEvent[];
}

/**
 * One coup of Punto Banco. Nobody decides anything: the cards are dealt
 * Player, Banker, Player, Banker, then each hand draws by the tableau.
 */
export function simulateBaccaratRound(input: BaccaratRoundInput): BaccaratRoundResult {
  const rules = input.rules ?? BACCARAT_RULES;
  const events: BaccaratEvent[] = [];
  const emit = (e: BaccaratEvent) => {
    if (input.recordEvents) events.push(e);
    input.onEvent?.(e);
  };

  let used = 0;
  let draw: () => Card;
  if (input.shoe) {
    const { cards, next: from } = input.shoe;
    draw = () => {
      const card = cards[from + used];
      if (!card) throw new Error('The shoe ran out of cards mid-round');
      used++;
      return card;
    };
  } else {
    const rng = new Rng(input.seed.run, 'baccarat', input.seed.round);
    const shoe: Card[] = [];
    for (let d = 0; d < rules.decks; d++) shoe.push(...standardDeck('player', `d${d}`));
    // Partial Fisher-Yates: only the cards dealt get shuffled.
    draw = () => {
      const j = used + rng.int(shoe.length - used);
      const card = shoe[j]!;
      shoe[j] = shoe[used]!;
      shoe[used] = card;
      used++;
      return card;
    };
  }

  const stakes = { ...input.bonuses };
  emit({ type: 'RoundStarted', round: input.seed.round, side: input.side, bonuses: stakes });

  const player: Card[] = [];
  const banker: Card[] = [];
  const deal = (to: BaccaratHand) => {
    const hand = to === 'player' ? player : banker;
    const card = draw();
    hand.push(card);
    emit({ type: 'CardDealt', to, index: hand.length - 1, card, total: baccaratTotal(hand) });
    return card;
  };

  deal('player');
  deal('banker');
  deal('player');
  deal('banker');

  const p2 = baccaratTotal(player);
  const b2 = baccaratTotal(banker);
  const natural = p2 >= 8 || b2 >= 8;
  if (natural) {
    emit({ type: 'Natural', hand: p2 >= 8 && b2 >= 8 ? 'both' : p2 >= 8 ? 'player' : 'banker', total: Math.max(p2, b2) });
  } else {
    let third: number | null = null;
    if (playerDraws(p2)) third = baccaratValue(deal('player').rank);
    if (bankerDraws(b2, third)) deal('banker');
  }

  const playerTotal = baccaratTotal(player);
  const bankerTotal = baccaratTotal(banker);
  const winner: BaccaratWinner = playerTotal > bankerTotal ? 'player' : bankerTotal > playerTotal ? 'banker' : 'tie';
  emit({ type: 'Winner', winner, player: playerTotal, banker: bankerTotal });

  let main: number;
  let note: string;
  if (winner === 'tie') {
    main = 0;
    note = 'tie pushes';
  } else if (winner === input.side) {
    main = winner === 'banker' ? 1 - rules.commission : 1;
    note = winner === 'banker' ? `wins, less ${+(rules.commission * 100).toFixed(2)}%` : 'wins';
  } else {
    main = -1;
    note = 'loses';
  }
  emit({ type: 'MainSettled', net: main, note });

  let net = main;
  const bonuses = settleBonuses(BACCARAT_BONUSES, stakes, { player, banker, winner });
  for (const result of bonuses) {
    net += result.net;
    emit({ type: 'BonusSettled', result });
  }
  emit({ type: 'RoundSettled', net });

  return { player, banker, playerTotal, bankerTotal, winner, natural, main, bonuses, net, cardsUsed: used, events };
}
