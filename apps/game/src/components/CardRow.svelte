<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Card } from '@idlesuits/sim';
  import { fromShoe } from '../lib/deal';
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
    /** Changes with every new deal; the cards are then thrown in from the shoe, one by one. */
    deal?: number;
    /** Order of this row in the deal, so rows are dealt one after another. */
    dealOrder?: number;
    /** The face-down card the table is building suspense on. */
    focus?: number;
  }

  let {
    title,
    cards,
    highlight,
    side = 'player',
    flipMs = 260,
    badge,
    wild,
    deal = 0,
    dealOrder = 0,
    focus = -1,
  }: Props = $props();

</script>

<section class="row {side}">
  {#if title || badge}
    <!-- Two fixed halves: the title ends at the centre line and the hand's name starts there, so neither moves the other. -->
    <header>
      <h2>{title ?? ''}</h2>
      <span class="badge">{@render badge?.()}</span>
    </header>
  {/if}
  <div class="cards">
    {#key deal}
      {#each cards as card, i (i)}
        <div
          class="slot"
          in:fromShoe={{ delay: (dealOrder * cards.length + i) * flipMs * 0.28, duration: Math.max(120, flipMs * 1.1) }}
        >
          <PlayingCard
            {card}
            {flipMs}
            highlight={!!card && !!highlight?.has(card.uid)}
            dim={!!card && !!highlight && highlight.size > 0 && !highlight.has(card.uid)}
            wild={!!card && !!wild?.(card)}
            focus={focus === i}
          />
        </div>
      {/each}
    {/key}
  </div>
</section>

<style>
  .row {
    display: grid;
    gap: 4px;
    justify-items: center;
    width: 100%;
    min-width: 0;
  }
  /* One line, fixed height: a hand's name appearing never moves the cards. */
  header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: center;
    column-gap: 10px;
    width: 100%;
    height: 24px;
    white-space: nowrap;
  }
  h2 {
    justify-self: end;
  }
  .badge {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    overflow: hidden;
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
  .slot {
    display: flex;
  }
</style>
