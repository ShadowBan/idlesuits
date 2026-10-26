/**
 * How cards are drawn, chosen by the player for readability and kept across
 * visits. One setting for the whole casino: every table and the lobby read it.
 *
 * Applied as attributes on <html> (`data-cards`, `data-suits`), so the styles
 * that draw cards, suit counters and mini cards all follow without each
 * component having to know.
 */

/** The layout of a card's face. */
export type CardFace = 'classic' | 'large' | 'jumbo';
/** How the four suits are coloured. */
export type SuitColors = 'two' | 'four' | 'contrast';

export const CARD_FACES: { id: CardFace; name: string; blurb: string }[] = [
  { id: 'classic', name: 'Classic', blurb: 'Corner index and a centre suit, as on a real deck' },
  { id: 'large', name: 'Large index', blurb: 'A much bigger rank and suit in the corner' },
  { id: 'jumbo', name: 'Jumbo', blurb: 'Rank and suit as big as the card allows' },
];

export const SUIT_COLORS: { id: SuitColors; name: string; blurb: string }[] = [
  { id: 'two', name: 'Two-colour', blurb: 'Red hearts and diamonds, black spades and clubs' },
  { id: 'four', name: 'Four-colour', blurb: 'Blue diamonds and green clubs: every suit its own colour' },
  { id: 'contrast', name: 'High contrast', blurb: 'Pure white cards, bold black edges, deeper colours' },
];

const KEY = 'idlesuits.cards';

function load(): { face: CardFace; suits: SuitColors } {
  const fallback = { face: 'classic' as CardFace, suits: 'two' as SuitColors };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<typeof fallback> | null;
    return {
      face: CARD_FACES.some((f) => f.id === saved?.face) ? saved!.face! : fallback.face,
      suits: SUIT_COLORS.some((s) => s.id === saved?.suits) ? saved!.suits! : fallback.suits,
    };
  } catch {
    // Storage blocked or unreadable: the defaults still work, they just won't be remembered.
    return fallback;
  }
}

export const cardStyle = $state(load());

function apply() {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.cards = cardStyle.face;
  document.documentElement.dataset.suits = cardStyle.suits;
  try {
    localStorage.setItem(KEY, JSON.stringify(cardStyle));
  } catch {
    // Not remembered this time; nothing else depends on it.
  }
}

export function setCardFace(face: CardFace) {
  cardStyle.face = face;
  apply();
}

export function setSuitColors(suits: SuitColors) {
  cardStyle.suits = suits;
  apply();
}

apply();
