<script lang="ts">
  import type { Snippet } from 'svelte';
  import { formatMoney, type Decimal } from '../lib/money';
  import ChipRack from './ChipRack.svelte';

  interface Props {
    bank: Decimal;
    /** Everything the next hand puts down to start. */
    total: Decimal;
    canDeal: boolean;
    onDeal?: () => void;
    onClear: () => void;
    onDouble: () => void;
    /** Replaces the Deal button, e.g. a Pause button while auto play runs. */
    trailing?: Snippet;
  }

  let { bank, total, canDeal, onDeal, onClear, onDouble, trailing }: Props = $props();
</script>

<div class="betbar">
  <ChipRack {bank} {onClear} {onDouble} />
  <div class="go">
    {#if trailing}
      {@render trailing()}
    {:else}
      <button type="button" class="deal primary" disabled={!canDeal} onclick={onDeal}>Deal</button>
    {/if}
    <span class="total">{total.gt(0) ? `Bet ${formatMoney(total)}` : 'Tap a spot to bet'}</span>
  </div>
</div>

<style>
  .betbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 8px 14px;
    min-height: 58px;
    padding: 8px 12px calc(8px + env(safe-area-inset-bottom));
  }
  .go {
    display: grid;
    justify-items: center;
    gap: 3px;
  }
  .deal {
    min-width: 108px;
    min-height: 44px;
    font: 700 16px/1 var(--font-display);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .deal:disabled {
    opacity: 0.4;
  }
  .total {
    height: 12px;
    font: 500 11px/12px var(--font-ui);
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  @media (orientation: landscape) and (max-height: 520px) {
    .betbar {
      flex-direction: column;
    }
  }
</style>
