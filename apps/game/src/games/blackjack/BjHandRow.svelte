<script lang="ts">
  import type { Card, HandTotal } from '@idlesuits/sim';
  import PlayingCard from '../../components/PlayingCard.svelte';
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
    /** A dealer 22 pushes, so it is worth calling out. */
    note?: string;
  }

  let { title, cards, total, side, flipMs, hand, active = false, bet, note }: Props = $props();

  const label = $derived.by(() => {
    if (!total || cards.every((c) => c === null)) return '';
    if (total.bust) return `Bust · ${total.total}`;
    return `${total.soft ? 'Soft ' : ''}${total.total}`;
  });
</script>

<section class="hand {side}" class:active>
  <header>
    <h2>{title}</h2>
    {#if label}
      <span class="total" class:bust={total?.bust} class:best={total?.total === 21}>{label}</span>
    {/if}
    {#if hand?.outcome}
      <span class="outcome" class:win={(hand.net ?? 0) > 0} class:loss={(hand.net ?? 0) < 0}>
        {outcomeLabel(hand.outcome)}
      </span>
    {/if}
    {#if note}<span class="note">{note}</span>{/if}
  </header>

  <div class="cards">
    {#each cards as card, i (i)}
      <PlayingCard {card} {flipMs} />
    {/each}
  </div>

  {#if hand && bet}
    <div class="stakes">
      {#if hand.bet > 0}<span class="chip">{formatMoney(bet.mul(hand.bet))}</span>{/if}
      {#if hand.free > 0}<span class="chip free">Free {formatMoney(bet.mul(hand.free))}</span>{/if}
      {#if hand.flash}
        <span class="flash">{hand.flash.free ? 'Free ' : ''}{hand.flash.move}</span>
      {/if}
    </div>
  {/if}
</section>

<style>
  .hand {
    display: grid;
    gap: 6px;
    justify-items: center;
    padding: 6px 8px;
    border-radius: 12px;
    border: 2px solid transparent;
    transition: border-color 200ms;
  }
  .hand.active {
    border-color: color-mix(in srgb, var(--gold) 60%, transparent);
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
    color: var(--side);
  }
  .player {
    --side: var(--player);
  }
  .dealer {
    --side: var(--dealer);
  }
  .total {
    font: 700 17px/1 var(--font-display);
    font-variant-numeric: tabular-nums;
  }
  .total.best {
    color: var(--gold);
  }
  .total.bust {
    color: var(--loss);
  }
  .outcome,
  .note {
    font: 700 11px/1 var(--font-ui);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 4px 8px;
    border-radius: 999px;
    background: var(--chip-bg);
    color: var(--muted);
  }
  .outcome.win {
    background: var(--win);
    color: var(--felt-deep);
  }
  .outcome.loss {
    background: var(--loss);
    color: var(--felt-deep);
  }
  .cards {
    display: flex;
    gap: var(--card-gap);
    max-width: 100%;
  }
  .stakes {
    display: flex;
    gap: 6px;
    align-items: center;
    min-height: 24px;
  }
  .chip {
    padding: 3px 9px;
    border-radius: 999px;
    border: 2px dashed var(--line);
    font: 600 11px/1.3 var(--font-ui);
    font-variant-numeric: tabular-nums;
  }
  .chip.free {
    border-style: solid;
    border-color: var(--gold);
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
