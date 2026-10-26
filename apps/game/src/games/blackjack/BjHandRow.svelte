<script lang="ts">
  import type { Card, HandTotal } from '@idlesuits/sim';
  import Chip from '../../components/Chip.svelte';
  import PlayingCard from '../../components/PlayingCard.svelte';
  import { chipIndexAtMost } from '../../lib/chips';
  import { fromShoe } from '../../lib/deal';
  import { formatMoney, type Decimal } from '../../lib/money';
  import { outcomeLabel, type HandView } from './table.svelte';

  interface Props {
    title: string;
    /** Nulls are cards still face down. */
    cards: (Card | null)[];
    total: HandTotal | null;
    side: 'player' | 'dealer';
    flipMs: number;
    /** Present for a player hand; carries bets and the result. */
    hand?: HandView;
    active?: boolean;
    bet?: Decimal;
    /** Show the hand's own stake under it: once there is more than the one bet on the spot. */
    stakes?: boolean;
    /** A dealer 22 pushes, so it is worth calling out. */
    note?: string;
  }

  let { title, cards, total, side, flipMs, hand, active = false, bet, stakes = false, note }: Props = $props();

  const label = $derived.by(() => {
    if (!total || cards.every((c) => c === null)) return '';
    if (total.bust) return `Bust ${total.total}`;
    return `${total.soft ? 'Soft ' : ''}${total.total}`;
  });
  const tone = $derived(hand?.net === undefined ? '' : hand.net > 0 ? 'win' : hand.net < 0 ? 'loss' : 'push');
  const own = $derived(hand && bet ? bet.mul(hand.bet) : null);
  const free = $derived(hand && bet && hand.free > 0 ? bet.mul(hand.free) : null);
</script>

<section class="hand {side} {tone}" class:active style:--n={Math.max(cards.length, 1)}>
  <header>
    <h2>{title}</h2>
    <span class="badge">
      {#if label}
        <span class="total" class:bust={total?.bust} class:best={total?.total === 21}>{label}</span>
      {/if}
    </span>
  </header>

  <!--
    A fixed-width fan: each new card lands on top, overlapping the last, and
    the fan re-centres with a slide (a transform, never a layout change).
  -->
  <div class="fan">
    {#each cards as card, i (i)}
      <div class="place" style:--i={i}>
        <div in:fromShoe={{ delay: 0, duration: Math.max(140, flipMs * 1.1) }}>
          <PlayingCard {card} {flipMs} />
        </div>
      </div>
    {/each}
    <!-- The result is stamped across the cards, as a dealer marks a hand: it needs no room in the header. -->
    {#if hand?.outcome}
      <span class="stamp">{outcomeLabel(hand.outcome)}</span>
    {:else if note}
      <span class="stamp note">{note}</span>
    {/if}
  </div>

  {#if side === 'player'}
    <div class="stakes">
      {#if stakes && own && own.gt(0)}
        <span class="stake"><Chip index={chipIndexAtMost(own)} label={false} />{formatMoney(own)}</span>
      {/if}
      {#if stakes && free}
        <span class="stake free"><span class="lammer">Free</span>{formatMoney(free)}</span>
      {/if}
      {#if hand?.flash}
        <span class="flash">{hand.flash.free ? 'Free ' : ''}{hand.flash.move}</span>
      {/if}
    </div>
  {/if}
</section>

<style>
  .hand {
    --step: min(calc(var(--card-w) * var(--fan-step)), calc(var(--card-w) * 1.44 / max(var(--n) - 1, 1)));
    --fan: calc(var(--card-w) * 2.44);
    display: grid;
    justify-items: center;
    gap: 4px;
    /* A fixed width, whatever the header says: totals and results never move the hand. */
    width: calc(var(--fan) + 16px);
    padding: 4px 6px;
    border-radius: 14px;
    border: 2px solid transparent;
    transition:
      border-color 200ms,
      background-color 200ms;
  }
  .hand.active {
    border-color: color-mix(in srgb, var(--gold) 60%, transparent);
    background: rgb(232 182 76 / 0.06);
  }
  header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: center;
    column-gap: 8px;
    width: 100%;
    height: 22px;
    white-space: nowrap;
  }
  h2 {
    justify-self: end;
    margin: 0;
    font: 600 12px/1 var(--font-ui);
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
  .badge {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    overflow: hidden;
  }
  .total {
    font: 700 17px/1 var(--font-display);
    font-variant-numeric: tabular-nums;
    text-transform: uppercase;
  }
  .total.best {
    color: var(--gold);
  }
  .total.bust {
    color: var(--loss);
  }
  .stamp {
    position: absolute;
    left: 50%;
    bottom: 10%;
    z-index: 20;
    transform: translateX(-50%) rotate(-6deg);
    padding: 4px 9px;
    border-radius: 6px;
    border: 2px solid currentColor;
    background: rgb(11 44 34 / 0.88);
    color: var(--muted);
    font: 700 max(11px, calc(var(--card-w) * 0.15)) / 1 var(--font-display);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    white-space: nowrap;
    box-shadow: 0 3px 10px rgb(0 0 0 / 0.45);
    pointer-events: none;
    animation: stamp 300ms cubic-bezier(0.2, 0.9, 0.3, 1.3);
  }
  .win .stamp {
    color: var(--win);
  }
  .loss .stamp {
    color: var(--loss);
  }
  .push .stamp,
  .stamp.note {
    color: var(--gold);
  }
  @keyframes stamp {
    from {
      transform: translateX(-50%) rotate(-6deg) scale(1.8);
      opacity: 0;
    }
  }
  .fan {
    position: relative;
    width: var(--fan);
    height: calc(var(--card-w) * 1.4);
  }
  .place {
    position: absolute;
    left: 0;
    top: 0;
    z-index: var(--i);
    /* Centred as a group: the fan's spread is the first card plus a step per card after it. */
    transform: translateX(
      calc((var(--fan) - var(--card-w) - var(--step) * (var(--n) - 1)) / 2 + var(--step) * var(--i))
    );
    transition: transform 240ms cubic-bezier(0.2, 0.8, 0.3, 1);
  }
  /* Darkened, not faded: faded cards in a fan would show through each other. */
  .loss .place {
    filter: brightness(0.8);
  }
  .stakes {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 20px;
    white-space: nowrap;
  }
  .stake {
    --chip: 16px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font: 600 11px/1 var(--font-ui);
    font-variant-numeric: tabular-nums;
  }
  .stake :global(.chip) {
    width: var(--chip);
    height: var(--chip);
  }
  .lammer {
    padding: 3px 5px;
    border-radius: 999px;
    background: var(--gold);
    color: var(--felt-deep);
    font: 800 8px/1 var(--font-ui);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .free {
    color: var(--gold);
  }
  .flash {
    font: 700 11px/1 var(--font-ui);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--gold);
    animation: pop 300ms ease-out;
  }
  @keyframes pop {
    from {
      transform: scale(0.6);
      opacity: 0;
    }
  }
</style>
