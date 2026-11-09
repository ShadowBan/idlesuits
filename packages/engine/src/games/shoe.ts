import { cutCardOut, shuffleShoe, type Shoe } from '@idlesuits/sim';
import type { EngineContext } from '../settle';
import { gameValue } from '../tuning';

/** A shoe as the state keeps it: which shuffle, how far in, and how many decks. Its order is the engine's secret. */
export interface ShoePlace {
  number: number;
  next: number;
  decks: number;
}

/** The cut card's range for a game's shoe: 70–80% in, or wherever the pit boss puts it. */
export function cutRange(game: string, ctx: EngineContext): [number, number] {
  const at = gameValue(ctx.tuning, game, 'penetration', 75) / 100;
  return [Math.max(0.1, at - 0.05), Math.min(0.97, at + 0.05)];
}

const shuffled = new Map<string, Shoe>();

/** A shoe's cards, from the secret seed for its shuffle: the same every time it's asked for. */
export function shoeAt(game: string, place: ShoePlace, cut: [number, number], ctx: EngineContext): Shoe {
  const seed = ctx.seed(`${game}.shoe`, place.number);
  const key = `${seed}|${place.decks}|${cut.join(',')}`;
  let shoe = shuffled.get(key);
  if (!shoe) {
    shoe = shuffleShoe(place.decks, [seed], cut);
    shuffled.set(key, shoe);
    // A few shoes are plenty: one per table in play.
    if (shuffled.size > 32) shuffled.delete(shuffled.keys().next().value!);
  }
  return { ...shoe, next: place.next };
}

/** The shoe to deal the next round from: the one in play, or a fresh shuffle once the cut card is out or the decks change. */
export function shoeForRound(game: string, saved: unknown, decks: number, ctx: EngineContext): { place: ShoePlace; shuffled: boolean } {
  const s = saved && typeof saved === 'object' ? (saved as Partial<ShoePlace>) : null;
  const cut = cutRange(game, ctx);
  if (s && Number.isInteger(s.number) && Number.isInteger(s.next) && s.decks === decks) {
    const place = { number: s.number!, next: s.next!, decks };
    if (!cutCardOut(shoeAt(game, place, cut, ctx))) return { place, shuffled: false };
    return { place: { number: place.number + 1, next: 1, decks }, shuffled: true };
  }
  return { place: { number: (s && Number.isInteger(s.number) ? s.number! : -1) + 1, next: 1, decks }, shuffled: true };
}
