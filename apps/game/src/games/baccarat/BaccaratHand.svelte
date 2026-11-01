<script lang="ts">
  import { baccaratTotal, type Card } from '@idlesuits/sim';
  import PlayingCard from '../../components/PlayingCard.svelte';

  interface Props {
    title: 'Player' | 'Banker';
    /** Three slots: undefined is no card, null a card face down. */
    cards: (Card | null | undefined)[];
    flipMs: number;
    /** The slot being squeezed. */
    focus?: number;
    /** This hand won the coup. */
    won?: boolean;
    /** The main bet backs this hand. */
    backed?: boolean;
    /** Set while the player turns this hand's face-down cards: called with the slot tapped. */
    onTurn?: (index: number) => void;
  }

  let { title, cards, flipMs, focus = -1, won = false, backed = false, onTurn }: Props = $props();

  const shown = $derived(cards.filter((c): c is Card => !!c));
  const total = $derived(shown.length ? baccaratTotal(shown) : null);
</script>

<!--
  One hand: two cards upright and a third, when drawn, laid sideways as a
  baccarat dealer places it. The third slot is always there, so nothing moves
  when it fills.
-->
<section class="hand {title.toLowerCase()}" class:won class:backed>
  <header>
    <h2>{title}</h2>
    <span class="total" class:on={total !== null}>{total ?? '\u00a0'}</span>
  </header>
  <div class="cards">
    {#each [0, 1, 2] as i (i)}
      <div class="slot" class:third={i === 2}>
        {#if cards[i] === null && onTurn}
          <button type="button" class="turn" aria-label="Turn {title} card {i + 1}" onclick={() => onTurn(i)}>
            <PlayingCard card={null} {flipMs} />
          </button>
        {:else if cards[i] !== undefined}
          <PlayingCard card={cards[i] ?? null} {flipMs} focus={focus === i} />
        {/if}
      </div>
    {/each}
  </div>
  <p class="cue" aria-live="polite">{onTurn ? 'Tap to turn' : ''}</p>
</section>

<style>
  .hand {
    --tint: #5cb6ff;
    display: grid;
    justify-items: center;
    /* Rows keep their own height, so both hands' cards line up whatever their headers hold. */
    align-content: start;
    gap: 6px;
    padding: 6px 8px 8px;
    border-radius: 14px;
    border: 2px solid transparent;
    transition:
      border-color 200ms ease,
      box-shadow 200ms ease;
  }
  .banker {
    --tint: #ff7a66;
  }
  .hand.won {
    border-color: var(--tint);
    box-shadow: 0 0 18px color-mix(in srgb, var(--tint) 45%, transparent);
  }
  header {
    display: flex;
    align-items: baseline;
    gap: 10px;
    height: 24px;
  }
  h2 {
    margin: 0;
    font: 700 14px/1 var(--font-display);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--tint);
  }
  .backed h2::after {
    content: ' ●';
    font-size: 9px;
    vertical-align: middle;
  }
  .total {
    min-width: 1ch;
    font: 700 22px/1 var(--font-display);
    color: var(--ink);
    font-variant-numeric: tabular-nums;
    opacity: 0;
    transition: opacity 160ms ease;
  }
  .total.on {
    opacity: 1;
  }
  .cards {
    display: flex;
    align-items: center;
    gap: calc(var(--card-w) * 0.08);
    height: calc(var(--card-w) * 1.4);
  }
  .slot {
    width: var(--card-w);
    height: calc(var(--card-w) * 1.4);
  }
  /* Laid sideways: a card's height across, its width down. */
  .third {
    display: grid;
    place-items: center;
    width: calc(var(--card-w) * 1.4);
  }
  .third :global(.card) {
    rotate: 90deg;
  }
  /* The player's own cards, waiting face down to be turned. */
  .turn {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
    border-radius: 8px;
    animation: beckon 1.4s ease-in-out infinite;
  }
  .turn:hover,
  .turn:focus-visible {
    translate: 0 -4px;
  }
  @keyframes beckon {
    50% {
      filter: drop-shadow(0 0 10px color-mix(in srgb, var(--tint) 80%, transparent));
    }
  }
  .cue {
    margin: 0;
    min-height: 1.2em;
    font: 600 11px/1.2 var(--font-ui);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--tint);
  }
  @media (prefers-reduced-motion: reduce) {
    .turn {
      animation: none;
      filter: drop-shadow(0 0 8px var(--tint));
    }
  }
</style>
