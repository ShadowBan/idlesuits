import type { Card } from '../cards';
import { handTotal, isPair } from './hand';
import { cardValue } from './rules';

/** H hit, S stand, D double (hit if it cannot), Ds double (stand if it cannot), P split. */
export type Action = 'H' | 'S' | 'D' | 'Ds' | 'P';
/** What the player may actually do right now. */
export type Move = 'hit' | 'stand' | 'double' | 'split';

/** player total or pair value → dealer upcard value → action. */
export type StrategyChart = Record<number, Record<number, Action>>;

export interface StrategySet {
  hard: StrategyChart;
  soft: StrategyChart;
  pairs: StrategyChart;
}

export interface StrategyTables {
  real: StrategySet;
  /** A hand riding on the house's money: it cannot lose, so it plays for wins. */
  free: StrategySet;
}

export interface Allowed {
  double: boolean;
  split: boolean;
}

function resolve(action: Action, allowed: Allowed): Move {
  switch (action) {
    case 'H':
      return 'hit';
    case 'S':
      return 'stand';
    case 'D':
      return allowed.double ? 'double' : 'hit';
    case 'Ds':
      return allowed.double ? 'double' : 'stand';
    case 'P':
      return allowed.split ? 'split' : 'hit';
  }
}

/** Looks up the chart action for a hand, before checking what is allowed. */
export function chartAction(tables: StrategySet, cards: readonly Card[], upcard: Card): Action {
  const up = cardValue(upcard.rank);
  const { total, soft } = handTotal(cards);
  if (isPair(cards)) {
    const pair = cardValue(cards[0]!.rank);
    const action = tables.pairs[pair]?.[up];
    if (action) return action;
  }
  const chart = soft && total <= 20 ? tables.soft : tables.hard;
  return chart[total]?.[up] ?? (total >= 17 ? 'S' : 'H');
}

export function decideMove(
  tables: StrategyTables,
  regime: 'real' | 'free',
  cards: readonly Card[],
  upcard: Card,
  allowed: Allowed,
): Move {
  const { total } = handTotal(cards);
  if (total >= 21) return 'stand';
  return resolve(chartAction(tables[regime], cards, upcard), allowed);
}
