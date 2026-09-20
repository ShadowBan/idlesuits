<script lang="ts">
  import type { Snippet } from 'svelte';
  import { flip } from 'svelte/animate';
  import { rankLabel, SUIT_SYMBOL, SUITS, type Card } from '@idlesuits/sim';
  import type { HandView } from '../lib/table.svelte';
  import PlayingCard from './PlayingCard.svelte';

  interface Props {
    title: string;
    hand: HandView;
    side: 'player' | 'dealer';
    flipMs: number;
    badge?: Snippet;
    /** Set when the player may turn over their own face-down cards. */
    onFlip?: (slot: number) => void;
    /** This hand won the main bet. */
    winner?: boolean;
    /** Position within the flush of the card that broke a tie. */
    decider?: number | null;
  }

  let { title, hand, side, flipMs, badge, onFlip, winner = false, decider = null }: Props = $props();

  const lead = $derived(hand.eval && (hand.eval.size >= 3 || hand.arranged) ? hand.eval.suit : null);

  /** Slot indices in display order: deal order, or flush-first once the hand is complete. */
  const order = $derived.by(() => {
    const slots = hand.cards.map((_, i) => i);
    if (!hand.arranged || !lead) return slots;
    return slots.sort((a, b) => {
      const ca = hand.cards[a]!;
      const cb = hand.cards[b]!;
      return Number(ca.suit !== lead) - Number(cb.suit !== lead) || cb.rank - ca.rank || ca.suit.localeCompare(cb.suit);
    });
  });
  /** First card after the flush, which gets a gap before it. */
  const firstOff = $derived(hand.arranged ? order.find((i) => hand.cards[i]?.suit !== lead) : undefined);
  const label = $derived.by(() => {
    if (!hand.eval || hand.eval.size < 2) return '';
    const { size, suit, ranks } = hand.eval;
    return `${size}-card ${SUIT_SYMBOL[suit]} flush · ${ranks.map(rankLabel).join('-')}`;
  });
</script>

<section class="hand {side}">
  <header>
    <h2>{title}</h2>
    {#if winner}<span class="wins">Wins</span>{/if}
    {#if label}<span class="label" class:big={(hand.eval?.size ?? 0) >= 5}>{label}</span>{/if}
    {@render badge?.()}
  </header>

  {#snippet face(card: Card | null, i: number)}
    <PlayingCard
      {card}
      {flipMs}
      highlight={lead !== null && card?.suit === lead}
      dim={lead !== null && card?.suit !== lead}
      focus={hand.focus === i || (hand.eager && card === null)}
    />
  {/snippet}

  <div class="cards">
    {#each order as i, pos (i)}
      {@const card = hand.cards[i] ?? null}
      {@const clickable = onFlip !== undefined && card === null}
      <div
        class="place"
        class:split={i === firstOff}
        class:decider={hand.arranged && decider !== null && pos === decider}
        animate:flip={{ duration: hand.arranged ? 450 : 0 }}
      >
        {#if side === 'player'}
          <button
            type="button"
            class="slot"
            class:clickable
            disabled={!clickable}
            aria-label={clickable ? `Reveal card ${i + 1}` : undefined}
            onclick={() => onFlip?.(i)}
          >
            {@render face(card, i)}
          </button>
        {:else}
          <div class="slot">{@render face(card, i)}</div>
        {/if}
      </div>
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
    max-width: 100%;
  }
  .place {
    position: relative;
    min-width: 0;
    display: flex;
    transition: margin 300ms ease;
  }
  .place.split {
    margin-left: calc(var(--card-w) * 0.3);
  }
  .place.decider::after {
    content: '';
    position: absolute;
    inset: -5px;
    top: -13px;
    border: 3px solid var(--gold);
    border-radius: calc(var(--card-w) * 0.14);
    pointer-events: none;
    animation: ring 500ms ease-out;
  }
  @keyframes ring {
    from {
      transform: scale(1.3);
      opacity: 0;
    }
  }
  .wins {
    font: 700 11px/1 var(--font-ui);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    padding: 4px 8px;
    border-radius: 999px;
    background: var(--gold);
    color: var(--felt-deep);
    animation: ring 400ms ease-out;
  }
  .slot {
    all: unset;
    display: block;
    border-radius: calc(var(--card-w) * 0.1);
  }
  .slot.clickable {
    cursor: pointer;
    transition: transform 150ms ease;
    padding: 4px;
    margin: -4px;
  }
  .slot.clickable:hover {
    transform: translateY(-6px);
  }
  .slot:focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: 3px;
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

  /* Phones: trim the space around each hand so both fit one screen. */
  @media (max-width: 899px) {
    .hand {
      gap: 6px;
    }
    header {
      min-height: 22px;
      gap: 8px;
    }
    .label {
      font-size: 14px;
    }
    .cards {
      padding-top: 8px;
    }
    .counters li {
      padding: 2px 8px;
      font-size: 13px;
    }
  }

  /* Landscape phones are shorter still; the flush label covers what the counters say. */
  @media (orientation: landscape) and (max-height: 520px) {
    .hand {
      gap: 2px;
    }
    .cards {
      padding-top: 4px;
    }
    .counters {
      display: none;
    }
  }
</style>
