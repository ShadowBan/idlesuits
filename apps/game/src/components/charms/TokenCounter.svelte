<script lang="ts">
  import { untrack } from 'svelte';
  import { meta } from '../../lib/meta.svelte';
  import { formatGain, formatTokens } from './format';

  /** A link to the charm machine, from the header. */
  let { href = '#/charms' }: { href?: string } = $props();

  /** The latest gain, floated off the counter: "+12". Keyed so each animates afresh. */
  let gain = $state<{ amount: number; key: number } | null>(null);
  let gains = 0;
  let last = untrack(() => meta.tokens);

  $effect(() => {
    const now = meta.tokens;
    const delta = now - last;
    last = now;
    if (delta >= 0.05) gain = { amount: delta, key: ++gains };
  });
</script>

<a class="tokens" {href} title="Tokens: spend them at the Charm Machine">
  <span class="coin" aria-hidden="true"></span>
  <span class="text">
    <span class="k">Tokens</span>
    {#key gain?.key}
      <span class="v" class:up={gain !== null}>{formatTokens(meta.tokens)}</span>
    {/key}
  </span>
  {#if gain}
    {#key gain.key}
      <span class="gain" aria-hidden="true">+{formatGain(gain.amount)}</span>
    {/key}
  {/if}
</a>

<style>
  .tokens {
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 72px;
    color: inherit;
    text-decoration: none;
  }
  .coin {
    flex: none;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #fff3c4, #e8b64c 45%, #a8741d);
    box-shadow:
      inset 0 0 0 2px #8a5a14,
      inset 0 0 0 4px #f2c64e;
  }
  .text {
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
    font: 700 18px/1.1 var(--font-display);
    color: #f2d27a;
    font-variant-numeric: tabular-nums;
  }
  .v.up {
    animation: glow 700ms ease-out;
  }
  @keyframes glow {
    30% {
      text-shadow: 0 0 12px rgb(242 198 78 / 0.9);
    }
  }
  .gain {
    position: absolute;
    left: 44px;
    top: -4px;
    font: 700 12px/1 var(--font-display);
    color: #f2d27a;
    white-space: nowrap;
    pointer-events: none;
    animation: rise 1200ms ease-out forwards;
  }
  @keyframes rise {
    0% {
      transform: translateY(8px);
      opacity: 0;
    }
    20% {
      transform: translateY(0);
      opacity: 1;
    }
    100% {
      transform: translateY(-12px);
      opacity: 0;
    }
  }
  @media (max-width: 420px) {
    .k {
      display: none;
    }
    .tokens {
      min-width: 54px;
    }
    .v {
      font-size: 16px;
    }
  }
</style>
