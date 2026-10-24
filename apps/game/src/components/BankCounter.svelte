<script lang="ts">
  import { untrack } from 'svelte';
  import { formatMoney, type Decimal } from '../lib/money';

  let { bank }: { bank: Decimal } = $props();

  /** What the counter shows: it rolls to the new balance rather than jumping. */
  let shown = $state(untrack(() => bank));
  /** The last change, floated off the counter: "+$40". Keyed so each one animates afresh. */
  let delta = $state<{ amount: Decimal; key: number } | null>(null);
  let deltas = 0;
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  $effect(() => {
    const to = bank;
    const from = untrack(() => shown);
    if (to.eq(from)) return;
    delta = { amount: to.sub(from), key: ++deltas };
    if (reduced) {
      shown = to;
      return;
    }
    const start = performance.now();
    const duration = 650;
    let frame = requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      shown = t < 1 ? from.add(to.sub(from).mul(eased)).floor() : to;
      if (t < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  });
</script>

<div class="counter">
  <span class="k">Bank</span>
  {#key delta?.key}
    <span class="v" class:up={delta?.amount.gt(0)} class:down={delta?.amount.lt(0)}>{formatMoney(shown)}</span>
  {/key}
  {#if delta}
    {#key delta.key}
      <span class="delta" class:loss={delta.amount.lt(0)} aria-hidden="true">{formatMoney(delta.amount, true)}</span>
    {/key}
  {/if}
</div>

<style>
  .counter {
    position: relative;
    display: grid;
    gap: 2px;
  }
  .k {
    font: 600 10px/1 var(--font-ui);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .v {
    font: 700 22px/1.1 var(--font-display);
    color: var(--gold);
    font-variant-numeric: tabular-nums;
  }
  :global(.compact) .v {
    font-size: 18px;
  }
  /* Floats up off the counter and fades: never part of the layout. */
  .delta {
    position: absolute;
    left: 100%;
    bottom: 2px;
    margin-left: 6px;
    font: 700 14px/1 var(--font-display);
    font-variant-numeric: tabular-nums;
    color: var(--win);
    white-space: nowrap;
    pointer-events: none;
    animation: rise 1300ms ease-out forwards;
  }
  .delta.loss {
    color: var(--loss);
  }
  @keyframes rise {
    0% {
      transform: translateY(6px) scale(0.8);
      opacity: 0;
    }
    15% {
      transform: translateY(0) scale(1.1);
      opacity: 1;
    }
    70% {
      opacity: 1;
    }
    100% {
      transform: translateY(-16px);
      opacity: 0;
    }
  }
  .v.up {
    animation: glow-win 800ms ease-out;
  }
  .v.down {
    animation: glow-loss 600ms ease-out;
  }
  @keyframes glow-win {
    30% {
      text-shadow: 0 0 14px rgb(107 224 143 / 0.8);
    }
  }
  @keyframes glow-loss {
    30% {
      color: var(--loss);
    }
  }
</style>
