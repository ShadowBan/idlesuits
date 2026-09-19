import { rankLabel, SUIT_SYMBOL, type HandEval, type MainOutcome } from '@idlesuits/sim';

const flushName = (h: HandEval) => `${h.size}-card ${SUIT_SYMBOL[h.suit]} flush`;

/** Why the main bet went the way it did, and which flush card decided a tie. */
export function explain(outcome: MainOutcome, player: HandEval, dealer: HandEval): [string, number | null] {
  switch (outcome) {
    case 'fold':
      return [`You folded a ${flushName(player)}`, null];
    case 'dealerNoQualify':
      return ['Dealer needs a 3-card flush, 9-high, to qualify. Ante pays, raise pushes', null];
    case 'push':
      return [`Identical ${player.size}-card flushes`, null];
    case 'win':
    case 'lose': {
      const [winner, loser] = outcome === 'win' ? [player, dealer] : [dealer, player];
      const [winnerName, loserName] = outcome === 'win' ? ['Your', "the dealer's"] : ["Dealer's", 'your'];
      if (winner.size !== loser.size) return [`${winnerName} ${flushName(winner)} beats ${loserName} ${flushName(loser)}`, null];
      const k = winner.ranks.findIndex((r, i) => r !== loser.ranks[i]);
      const mine = outcome === 'win' ? 'your' : 'their';
      const theirs = outcome === 'win' ? 'their' : 'your';
      return [
        `Both ${winner.size}-card flushes: ${mine} ${rankLabel(winner.ranks[k]!)} beats ${theirs} ${rankLabel(loser.ranks[k]!)}`,
        k,
      ];
    }
  }
}
