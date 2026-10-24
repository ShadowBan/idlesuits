<script lang="ts">
  import { cubicOut } from 'svelte/easing';
  import { chipsFor } from '../lib/chips';
  import type { Decimal } from '../lib/money';
  import Chip from './Chip.svelte';

  interface Props {
    amount: Decimal;
    /** Most chips drawn; past this the stack stops growing and only the total says more. */
    max?: number;
  }

  let { amount, max = 7 }: Props = $props();

  /** Largest chips at the bottom, as a dealer stacks them. */
  const chips = $derived(chipsFor(amount, max));

  /** A chip set down from above: drops and settles. */
  function drop(_node: Element, { delay = 0 }: { delay?: number }) {
    return {
      delay,
      duration: 220,
      easing: cubicOut,
      css: (t: number) => `transform: translateY(${(1 - t) * -18}px); opacity: ${Math.min(1, t * 2)}`,
    };
  }
</script>

<!-- Fixed size: a growing stack rises within its box and never pushes the table around. -->
<div class="stack" style:--n={max}>
  {#each chips as index, i (`${i}:${index}`)}
    <div class="slot" style:--i={i} in:drop={{ delay: i * 25 }}>
      <Chip {index} label={i === chips.length - 1} />
    </div>
  {/each}
</div>

<style>
  .stack {
    position: relative;
    width: var(--chip, 40px);
    height: calc(var(--chip, 40px) + (var(--n) - 1) * var(--chip, 40px) * 0.12);
  }
  .slot {
    position: absolute;
    left: 0;
    bottom: calc(var(--i) * var(--chip, 40px) * 0.12);
  }
</style>
