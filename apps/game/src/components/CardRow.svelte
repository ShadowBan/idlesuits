<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Card } from '@idlesuits/sim';
  import PlayingCard from './PlayingCard.svelte';

  interface Props {
    title?: string;
    /** Nulls are cards still face down. */
    cards: (Card | null)[];
    /** Cards that make up the hand being shown; the rest are dimmed. */
    highlight?: Set<string>;
    side?: 'player' | 'dealer' | 'board';
    flipMs?: number;
    /** Hand name, results, badges — whatever the game wants beside the title. */
    badge?: Snippet;
    /** Which cards are wild, for games that have them. */
    wild?: (card: Card) => boolean;
  }

  let { title, cards, highlight, side = 'player', flipMs = 260, badge, wild }: Props = $props();
</script>

<section class="row {side}">
  {#if title || badge}
    <header>
      {#if title}<h2>{title}</h2>{/if}
      {@render badge?.()}
    </header>
  {/if}
  <div class="cards">
    {#each cards as card, i (i)}
      <PlayingCard
        {card}
        {flipMs}
        highlight={!!card && !!highlight?.has(card.uid)}
        dim={!!card && !!highlight && highlight.size > 0 && !highlight.has(card.uid)}
        wild={!!card && !!wild?.(card)}
      />
    {/each}
  </div>
</section>

<style>
  .row {
    display: grid;
    gap: 6px;
    justify-items: center;
  }
  header {
    display: flex;
    align-items: baseline;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: center;
    min-height: 22px;
  }
  h2 {
    margin: 0;
    font: 600 12px/1 var(--font-ui);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--side, var(--muted));
  }
  .player {
    --side: var(--player);
  }
  .dealer {
    --side: var(--dealer);
  }
  .cards {
    display: flex;
    gap: var(--card-gap);
    max-width: 100%;
    padding-top: 8px;
  }
</style>
