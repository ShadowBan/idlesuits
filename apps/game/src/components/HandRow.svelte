<script lang="ts">
  import type { Snippet } from 'svelte';
  import { rankLabel, SUIT_SYMBOL, SUITS } from '@idlesuits/sim';
  import type { HandView } from '../lib/table.svelte';
  import PlayingCard from './PlayingCard.svelte';

  interface Props {
    title: string;
    hand: HandView;
    side: 'player' | 'dealer';
    flipMs: number;
    badge?: Snippet;
  }

  let { title, hand, side, flipMs, badge }: Props = $props();

  const revealed = $derived(hand.cards.filter((c) => c !== null).length);
  const lead = $derived(hand.eval && hand.eval.size >= 3 ? hand.eval.suit : null);
  const label = $derived.by(() => {
    if (!hand.eval || revealed === 0) return '';
    const { size, suit, ranks } = hand.eval;
    return `${size}-card ${SUIT_SYMBOL[suit]} flush · ${ranks.map(rankLabel).join('-')}`;
  });
</script>

<section class="hand {side}">
  <header>
    <h2>{title}</h2>
    {#if label}<span class="label" class:big={(hand.eval?.size ?? 0) >= 5}>{label}</span>{/if}
    {@render badge?.()}
  </header>

  <div class="cards">
    {#each hand.cards as card, i (i)}
      <PlayingCard
        {card}
        {flipMs}
        highlight={lead !== null && card?.suit === lead}
        dim={lead !== null && card?.suit !== lead}
        focus={hand.focus === i}
      />
    {/each}
  </div>

  <ul class="counters" aria-label="Suit counts">
    {#each SUITS as suit (suit)}
      {@const n = hand.eval?.suitCounts[suit] ?? 0}
      <li class:lead={lead === suit} class:red={suit === 'H' || suit === 'D'}>
        {SUIT_SYMBOL[suit]}
        {#key n}<b class="n">{n}</b>{/key}
      </li>
    {/each}
  </ul>
</section>

<style>
  .hand {
    display: grid;
    gap: 10px;
    justify-items: center;
  }
  header {
    display: flex;
    align-items: baseline;
    gap: 12px;
    flex-wrap: wrap;
    justify-content: center;
    min-height: 28px;
  }
  h2 {
    margin: 0;
    font: 600 13px/1 var(--font-ui);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--side);
  }
  .player {
    --side: var(--player);
  }
  .dealer {
    --side: var(--dealer);
  }
  .label {
    font: 600 15px/1 var(--font-display);
    color: var(--ink);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .label.big {
    color: var(--gold);
    text-shadow: 0 0 12px rgb(227 179 65 / 0.5);
  }
  .cards {
    display: flex;
    gap: var(--card-gap);
    padding-top: 14px;
  }
  .counters {
    display: flex;
    gap: 6px;
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .counters li {
    display: flex;
    gap: 5px;
    align-items: center;
    padding: 3px 10px;
    border-radius: 999px;
    background: var(--chip-bg);
    color: var(--muted);
    font: 500 14px/1.2 var(--font-ui);
    transition:
      background 200ms,
      color 200ms,
      transform 200ms;
  }
  .counters li.red {
    color: var(--suit-red-soft);
  }
  .counters li.lead {
    background: var(--side);
    color: var(--felt-deep);
    transform: scale(1.1);
  }
  .n {
    display: inline-block;
    animation: bump 260ms ease-out;
  }
  @keyframes bump {
    from {
      transform: scale(1.6);
    }
  }
</style>
