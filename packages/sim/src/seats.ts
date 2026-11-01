/** Which seat a hand is dealt to, and how many hands are at the table. */
export interface Seat {
  index: number;
  of: number;
}

/**
 * Deals around a table. `draw` gives the deck's cards in shuffled order. A
 * round's first `perHand` draws are its seat's own cards, dealt after every
 * seat before it; every later draw (the dealer, the board) is shared, dealt
 * after all the seats' hands. So hands at the same table get different cards
 * but the same dealer, and more hands change which cards each seat gets.
 * Without a seat, or alone at the table, draws pass straight through.
 */
export function seated<T>(draw: () => T, perHand: number, seat?: Seat): () => T {
  if (!seat || seat.of <= 1) return draw;
  const dealt: T[] = [];
  const at = (i: number): T => {
    while (dealt.length <= i) dealt.push(draw());
    return dealt[i]!;
  };
  let drawn = 0;
  return () => {
    const i = drawn < perHand ? seat.index * perHand + drawn : seat.of * perHand + (drawn - perHand);
    drawn++;
    return at(i);
  };
}
