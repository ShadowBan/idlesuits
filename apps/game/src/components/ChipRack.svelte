<script lang="ts">
  import { chipInHand, heldChip } from '../lib/betting.svelte';
  import { rackFor } from '../lib/chips';
  import type { Decimal } from '../lib/money';
  import Chip from './Chip.svelte';

  interface Props {
    bank: Decimal;
    /** Takes every chip off the table's spots. */
    onClear?: () => void;
    /** Doubles every bet on the table. */
    onDouble?: () => void;
  }

  let { bank, onClear, onDouble }: Props = $props();

  const rack = $derived(rackFor(bank));
  const held = $derived(heldChip(bank));
</script>

<div class="rack" role="group" aria-label="Chips">
  <div class="chips">
    {#each rack as index (index)}
      <button
        type="button"
        class="pick"
        class:held={index === held}
        aria-pressed={index === held}
        onclick={() => (chipInHand.index = index)}
      >
        <Chip {index} />
      </button>
    {/each}
  </div>
  {#if onClear || onDouble}
    <div class="tools">
      {#if onDouble}<button type="button" onclick={onDouble}>×2</button>{/if}
      {#if onClear}<button type="button" onclick={onClear}>Clear</button>{/if}
    </div>
  {/if}
</div>

<style>
  .rack {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 10px;
    border-radius: 999px;
    background: linear-gradient(#24170f, #150d08);
    box-shadow:
      inset 0 2px 4px rgb(0 0 0 / 0.6),
      0 1px 0 rgb(255 255 255 / 0.05);
  }
  .chips {
    display: flex;
    gap: 4px;
  }
  /* Sized to the chip on both axes (phones give buttons a minimum width), so the ring stays round. */
  .pick {
    --chip: 40px;
    width: calc(var(--chip) + 4px);
    height: calc(var(--chip) + 4px);
    min-width: 0;
    min-height: 0;
    padding: 2px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 50%;
    background: none;
    transition: transform 140ms ease;
  }
  .pick:hover:not(:disabled) {
    background: none;
    transform: translateY(-2px);
  }
  .pick.held {
    transform: translateY(-5px);
    box-shadow: 0 0 0 2px var(--gold);
  }
  .tools {
    display: flex;
    gap: 6px;
  }
  .tools button {
    min-height: 34px;
    padding: 6px 10px;
    border-radius: 999px;
    font: 600 12px/1 var(--font-ui);
  }
  /* Landscape phones give the rack a narrow side column: chips wrap, tools go underneath. */
  @media (orientation: landscape) and (max-height: 520px) {
    .rack {
      flex-direction: column;
      gap: 6px;
      padding: 6px;
      border-radius: 16px;
    }
    .chips {
      flex-wrap: wrap;
      justify-content: center;
      max-width: 150px;
    }
    .pick {
      --chip: 34px;
    }
  }
  @media (max-width: 420px) {
    .rack {
      gap: 6px;
      padding: 4px 6px;
    }
    .pick {
      --chip: 34px;
    }
    .tools button {
      padding: 6px 8px;
    }
  }
</style>
