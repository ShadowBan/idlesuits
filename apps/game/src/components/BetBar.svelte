<script lang="ts">
  import type { Snippet } from 'svelte';
  import { formatMoney, type Decimal } from '../lib/money';
  import ChipRack from './ChipRack.svelte';

  interface Props {
    bank: Decimal;
    /** Everything the next hand puts down to start. */
    total: Decimal;
    canDeal: boolean;
    /** Shown in place of the total when the table's limits hold up the deal. */
    hint?: string | null;
    onDeal?: () => void;
    onClear: () => void;
    onDouble: () => void;
    /** Replaces the Deal button, e.g. a Pause button while auto play runs. */
    trailing?: Snippet;
  }

  let { bank, total, canDeal, hint = null, onDeal, onClear, onDouble, trailing }: Props = $props();
</script>

<div class="betbar">
  <ChipRack {bank} {onClear} {onDouble} />
  <div class="go">
    {#if trailing}
      {@render trailing()}
    {:else}
      <button type="button" class="deal primary" disabled={!canDeal} onclick={onDeal}>Deal</button>
    {/if}
    <span class="total" class:hint>{hint ?? (total.gt(0) ? `Bet ${formatMoney(total)}` : 'Tap a spot to bet')}</span>
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
  /* The Deal button: polished gold, breathing while a bet is down and waiting. */
  .deal {
    min-width: 120px;
    min-height: 46px;
    border: 0;
    border-radius: 12px;
    background:
      linear-gradient(rgb(255 255 255 / 0.35), rgb(255 255 255 / 0) 50%),
      linear-gradient(#f2c64e, #b8862a);
    color: #2a1a06;
    font: 700 17px/1 var(--font-display);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 0.5),
      0 4px 0 #6e4e14,
      0 6px 14px rgb(0 0 0 / 0.45);
    transition:
      transform 90ms ease,
      box-shadow 90ms ease;
  }
  .deal:not(:disabled) {
    animation: ready 1.6s ease-in-out infinite alternate;
  }
  /* Stays gold under the pointer: the app's plain button hover would grey it out. */
  .deal:hover:not(:disabled) {
    background:
      linear-gradient(rgb(255 255 255 / 0.35), rgb(255 255 255 / 0) 50%),
      linear-gradient(#f2c64e, #b8862a);
    filter: brightness(1.08);
  }
  .deal:active:not(:disabled) {
    transform: translateY(3px);
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 0.5),
      0 1px 0 #6e4e14,
      0 2px 6px rgb(0 0 0 / 0.45);
  }
  @keyframes ready {
    to {
      box-shadow:
        inset 0 1px 0 rgb(255 255 255 / 0.5),
        0 4px 0 #6e4e14,
        0 6px 14px rgb(0 0 0 / 0.45),
        0 0 22px rgb(242 198 78 / 0.55);
    }
  }
  .deal:disabled {
    opacity: 0.4;
    animation: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .deal:not(:disabled) {
      animation: none;
    }
  }
  .total {
    height: 12px;
    font: 500 11px/12px var(--font-ui);
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .total.hint {
    color: var(--gold);
  }
  @media (orientation: landscape) and (max-height: 520px) {
    .betbar {
      flex-direction: column;
    }
  }
</style>
