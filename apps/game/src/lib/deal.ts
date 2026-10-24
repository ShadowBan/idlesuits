import { cubicOut } from 'svelte/easing';

/**
 * A card sliding in from the dealer's shoe, top right of the table, turning
 * as it comes and settling into place. Container units, so it reads the same
 * on any size of felt.
 */
export function fromShoe(_node: Element, { delay, duration }: { delay: number; duration: number }) {
  return {
    delay,
    duration,
    easing: cubicOut,
    css: (t: number, u: number) =>
      `transform: translate(${u * 26}cqw, ${u * -46}cqh) rotate(${u * -24}deg); opacity: ${Math.min(1, t * 3)}`,
  };
}
