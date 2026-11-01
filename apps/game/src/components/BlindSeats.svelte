<script lang="ts">
  import type { BlindSeat } from '../lib/blind.svelte';
  import { formatMoney } from '../lib/money';
  import PlayingCard from './PlayingCard.svelte';

  interface Props {
    seats: BlindSeat[];
    flipMs?: number;
    /** How far down the felt the seats sit, so each table can keep them clear of its cards. */
    top?: string;
  }

  let { seats, flipMs = 260, top = '38%' }: Props = $props();
</script>

<!--
  The extra hands a Lucky Seat deals, in the seats either side of the player's:
  small, face down until the dealer shows, played all in.
-->
{#if seats.length}
  <div class="seats" style:--top={top} aria-label="Blind hands">
    {#each seats as seat, i (i)}
      <div class="seat" class:right={i % 2 === 1} style:--n={seat.cards.length}>
        <span class="title">Blind {i + 1} · {formatMoney(seat.stake)}</span>
        <div class="fan">
          {#each seat.cards as card, c (c)}
            <span class="slot" style:--i={c}><PlayingCard card={seat.shown ? card : null} {flipMs} /></span>
          {/each}
        </div>
        <span class="result">
          {#if seat.shown}<span class="name">{seat.label}</span>{/if}
          {#if seat.net}
            <b class:win={seat.net.gt(0)} class:lose={seat.net.lt(0)}>{seat.net.gt(0) ? '+' : ''}{formatMoney(seat.net)}</b>
          {/if}
        </span>
      </div>
    {/each}
  </div>
{/if}

<style>
  .seats {
    position: absolute;
    inset: var(--top) 8px auto;
    display: flex;
    justify-content: space-between;
    pointer-events: none;
  }
  .seat {
    --card-w: clamp(20px, 6.5cqw, 52px);
    /* More cards overlap more, so a seven-card hand is no wider than a three-card one by much. */
    --step: calc(var(--card-w) * (1.4 / var(--n)));
    display: grid;
    justify-items: start;
    gap: 3px;
  }
  .seat.right {
    justify-items: end;
    margin-left: auto;
  }
  .title {
    font: 600 9px/1 var(--font-ui);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--print);
    white-space: nowrap;
  }
  .fan {
    position: relative;
    width: calc(var(--card-w) + var(--step) * (var(--n) - 1));
    height: calc(var(--card-w) * 1.4);
  }
  .slot {
    position: absolute;
    left: calc(var(--step) * var(--i));
    top: 0;
  }
  .result {
    display: flex;
    gap: 5px;
    align-items: baseline;
    min-height: 12px;
    font: 600 10px/1.1 var(--font-ui);
    white-space: nowrap;
  }
  .name {
    color: var(--ink);
  }
  b {
    font: 700 11px/1 var(--font-display);
    color: var(--muted);
  }
  b.win {
    color: var(--win);
  }
  b.lose {
    color: var(--lose, #ff8a7a);
  }
</style>
