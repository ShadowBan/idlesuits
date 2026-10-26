<script lang="ts">
  import { rankLabel, SUIT_SYMBOL, type Card } from '@idlesuits/sim';

  interface Props {
    card: Card | null;
    /** Part of the hand's leading suit. */
    highlight?: boolean;
    /** Pushed back while the leading suit takes focus. */
    dim?: boolean;
    /** The face-down card the director is building tension on. */
    focus?: boolean;
    flipMs?: number;
    /** Marks a wild card with a small tag. */
    wild?: boolean;
  }

  let { card, highlight = false, dim = false, focus = false, flipMs = 260, wild = false }: Props = $props();

  const SUIT_NAME = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' } as const;
</script>

<!--
  The face's layout and colours come from the player's card style (lib/cardStyle),
  set as attributes on <html>: classic, large index or jumbo faces, in two
  colours, four colours or high contrast.
-->

<div
  class="card"
  class:up={card !== null}
  class:highlight={highlight && card !== null}
  class:dim={dim && card !== null}
  class:focus={focus && card === null}
  style:--flip="{flipMs}ms"
>
  <div class="inner">
    <div class="face back" aria-hidden="true"></div>
    <!-- The front is empty while face down, so no old face can ever show through. -->
    <div
      class="face front {card && !card.joker ? `suit-${card.suit}` : 'joker-face'}"
      aria-label={card ? (card.joker ? 'Joker' : `${rankLabel(card.rank)} of ${SUIT_NAME[card.suit]}`) : undefined}
    >
      {#if card?.joker}
        <span class="corner"><b class="rank">★</b></span>
        <span class="joker">Joker</span>
        <span class="corner flip"><b class="rank">★</b></span>
        {#if wild}<span class="wild">Wild</span>{/if}
      {:else if card}
        <span class="corner"><b class="rank">{rankLabel(card.rank)}</b><span class="suit">{SUIT_SYMBOL[card.suit]}</span></span>
        <span class="pip">{SUIT_SYMBOL[card.suit]}</span>
        <span class="corner flip"><b class="rank">{rankLabel(card.rank)}</b><span class="suit">{SUIT_SYMBOL[card.suit]}</span></span>
        {#if wild}<span class="wild">Wild</span>{/if}
      {/if}
    </div>
  </div>
</div>

<style>
  .card {
    width: var(--card-w);
    aspect-ratio: 5 / 7;
    perspective: 700px;
    transition:
      transform 220ms ease,
      filter 220ms ease;
    flex: 0 1 auto;
    min-width: 0;
  }
  .inner {
    position: relative;
    width: 100%;
    height: 100%;
    transform-style: preserve-3d;
    transform: rotateY(180deg);
  }
  /* Only turning face up animates; a new hand snaps face down instantly. */
  .up .inner {
    transform: rotateY(0deg);
    transition: transform var(--flip) cubic-bezier(0.3, 0.7, 0.3, 1);
  }
  .face {
    position: absolute;
    inset: 0;
    border-radius: calc(var(--card-w) * 0.1);
    backface-visibility: hidden;
    box-shadow: 0 2px 6px rgb(0 0 0 / 0.35);
  }
  .back {
    transform: rotateY(180deg);
    background:
      repeating-linear-gradient(45deg, transparent 0 6px, rgb(255 255 255 / 0.07) 6px 7px),
      repeating-linear-gradient(-45deg, transparent 0 6px, rgb(255 255 255 / 0.07) 6px 7px),
      var(--card-back);
    border: 3px solid var(--card-face);
  }
  .front {
    background: var(--card-face);
    color: var(--card-black);
    display: grid;
    place-items: center;
    font-family: var(--font-display);
    box-shadow:
      inset 0 0 0 calc(var(--card-w) * 0.03) var(--card-edge),
      0 2px 6px rgb(0 0 0 / 0.35);
  }
  .suit-S {
    color: var(--suit-S);
  }
  .suit-H {
    color: var(--suit-H);
  }
  .suit-D {
    color: var(--suit-D);
  }
  .suit-C {
    color: var(--suit-C);
  }

  /* Classic: a small index in two corners and the suit in the middle. */
  .corner {
    position: absolute;
    top: 5%;
    left: 8%;
    display: grid;
    justify-items: center;
    font-size: calc(var(--card-w) * 0.2);
    line-height: 0.95;
    text-align: center;
  }
  .rank {
    font-weight: 700;
  }
  .corner.flip {
    top: auto;
    left: auto;
    bottom: 5%;
    right: 8%;
    transform: rotate(180deg);
  }
  .pip {
    font-size: calc(var(--card-w) * 0.5);
  }

  /*
   * Large index: the corner is most of what shows in a fan or on a phone, so
   * make it nearly twice the size. The upside-down corner goes; the suit in
   * the middle steps down and aside.
   */
  :global([data-cards='large']) .corner {
    top: 4%;
    left: 6%;
    gap: 2px;
  }
  :global([data-cards='large']) .rank {
    font-size: calc(var(--card-w) * 0.38);
    line-height: 0.9;
    letter-spacing: -0.04em;
  }
  :global([data-cards='large']) .suit {
    font-size: calc(var(--card-w) * 0.3);
    line-height: 1;
  }
  :global([data-cards='large']) .corner.flip {
    display: none;
  }
  :global([data-cards='large']) .pip {
    font-size: calc(var(--card-w) * 0.44);
    transform: translate(22%, 34%);
  }

  /*
   * Jumbo: the rank as big as the card is wide, the suit under it, and the
   * suit again filling the opposite corner. Nothing else.
   */
  :global([data-cards='jumbo']) .corner {
    top: 2%;
    left: 5%;
    justify-items: start;
    gap: 0;
  }
  :global([data-cards='jumbo']) .rank {
    font-size: calc(var(--card-w) * 0.6);
    line-height: 0.88;
    letter-spacing: -0.06em;
  }
  :global([data-cards='jumbo']) .suit {
    font-size: calc(var(--card-w) * 0.4);
    line-height: 1;
    margin-left: 0.04em;
  }
  :global([data-cards='jumbo']) .corner.flip {
    display: none;
  }
  :global([data-cards='jumbo']) .pip {
    position: absolute;
    right: 6%;
    bottom: 1%;
    font-size: calc(var(--card-w) * 0.58);
    line-height: 1;
  }
  :global([data-cards='jumbo']) .joker {
    font-size: calc(var(--card-w) * 0.24);
  }
  .wild {
    position: absolute;
    left: 50%;
    bottom: 14%;
    transform: translateX(-50%);
    padding: 1px 4px;
    border-radius: 3px;
    background: var(--gold);
    color: var(--felt-deep);
    font: 700 calc(var(--card-w) * 0.14) / 1 var(--font-ui);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .joker {
    font-size: calc(var(--card-w) * 0.19);
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--gold);
    writing-mode: vertical-rl;
    text-orientation: upright;
  }
  .highlight {
    transform: translateY(-8px);
    filter: drop-shadow(0 0 8px var(--glow));
  }
  /* Darkened, never transparent: cards pass over each other when a hand is arranged. */
  .dim {
    transform: scale(0.94);
  }
  .dim .front {
    filter: saturate(0.35) brightness(0.62);
  }
  /* High contrast keeps set-aside cards readable: pushed back, but only a little darker. */
  :global([data-suits='contrast']) .dim .front {
    filter: brightness(0.82);
  }
  .focus {
    transform: translateY(-14px) scale(1.08);
    animation: pulse 700ms ease-in-out infinite alternate;
  }
  @keyframes pulse {
    from {
      filter: drop-shadow(0 0 2px var(--gold));
    }
    to {
      filter: drop-shadow(0 0 16px var(--gold));
    }
  }
</style>
