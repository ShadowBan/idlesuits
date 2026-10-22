import { FREE_BET_RULES } from '@idlesuits/sim';

/**
 * The chance a Free Bet Blackjack round earns at least one free bet, exactly.
 * Free doubles need a two-card hard 9-11 and free splits a pair (not tens),
 * so it is decided by the first two cards, unless the dealer has blackjack,
 * which ends the round before anyone plays. Pot of Gold wins exactly then.
 */
export function chanceOfFreeBet(rules = FREE_BET_RULES): number {
  // Card values 2..11 (11 = ace); ten-valued cards are four ranks.
  const counts = new Map<number, number>();
  for (let v = 2; v <= 11; v++) counts.set(v, (v === 10 ? 4 : 1) * 4 * rules.decks);
  const total = 52 * rules.decks;

  const eligible = (a: number, b: number) => {
    if (a === b) return a !== rules.noSplitValue;
    if (a === 11 || b === 11) return false; // soft hands never double free
    return rules.freeDoubleTotals.includes(a + b);
  };

  let p = 0;
  const left = new Map(counts);
  const take = (v: number) => {
    const n = left.get(v)!;
    left.set(v, n - 1);
    return n;
  };
  const give = (v: number) => left.set(v, left.get(v)! + 1);

  for (const [a] of counts) {
    const pa = take(a) / total;
    for (const [b] of counts) {
      const pb = left.get(b)! / (total - 1);
      if (pb === 0) continue;
      take(b);
      if (eligible(a, b)) {
        // The dealer's two cards, from what is left.
        let dealerBj = 0;
        const rest = total - 2;
        dealerBj += (left.get(11)! / rest) * (left.get(10)! / (rest - 1));
        dealerBj += (left.get(10)! / rest) * (left.get(11)! / (rest - 1));
        p += pa * pb * (1 - dealerBj);
      }
      give(b);
    }
    give(a);
  }
  return p;
}
