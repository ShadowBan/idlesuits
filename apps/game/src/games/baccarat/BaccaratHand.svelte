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
  }

  let { title, cards, flipMs, focus = -1, won = false, backed = false }: Props = $props();

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
    <span class="total" class:on={total !== null}>{total ?? ''}</span>
  </header>
  <div class="cards">
    {#each [0, 1] as i (i)}
      <div class="slot">
        {#if cards[i] !== undefined}<PlayingCard card={cards[i] ?? null} {flipMs} focus={focus === i} />{/if}
      </div>
    {/each}
    <div class="slot third">
      {#if cards[2] !== undefined}<PlayingCard card={cards[2] ?? null} {flipMs} focus={focus === 2} />{/if}
    </div>
  </div>
</section>

<style>
  .hand {
    --tint: #5cb6ff;
    display: grid;
    justify-items: center;
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
</style>
