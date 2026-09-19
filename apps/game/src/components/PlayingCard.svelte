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
  }

  let { card, highlight = false, dim = false, focus = false, flipMs = 260 }: Props = $props();

  const SUIT_NAME = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' } as const;
  const red = $derived(card?.suit === 'H' || card?.suit === 'D');
</script>

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
    <div class="face front" class:red aria-label={card ? `${rankLabel(card.rank)} of ${SUIT_NAME[card.suit]}` : undefined}>
      {#if card}
        <span class="corner">{rankLabel(card.rank)}<br />{SUIT_SYMBOL[card.suit]}</span>
        <span class="pip">{SUIT_SYMBOL[card.suit]}</span>
        <span class="corner flip">{rankLabel(card.rank)}<br />{SUIT_SYMBOL[card.suit]}</span>
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
    flex: none;
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
  }
  .front.red {
    color: var(--card-red);
  }
  .corner {
    position: absolute;
    top: 5%;
    left: 8%;
    font-size: calc(var(--card-w) * 0.2);
    line-height: 0.95;
    font-weight: 700;
    text-align: center;
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
