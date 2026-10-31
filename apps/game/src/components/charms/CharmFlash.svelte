<script lang="ts">
  import { untrack } from 'svelte';
  import { meta } from '../../lib/meta.svelte';
  import { formatMoney } from '../../lib/money';
  import CharmArt from './CharmArt.svelte';
  import { formatGain } from './format';

  /**
   * The banner appears as its hand settles, a moment before or after the
   * charms are counted: only charms from within that moment belong to it.
   */
  const mounted = untrack(() => performance.now());

  /** Charms that paid something worth showing on the hand just settled. */
  const shown = $derived.by(() => {
    const flash = meta.flash;
    if (!flash || Math.abs(flash.at - mounted) > 600) return null;
    const triggers = flash.triggers.filter((t) => t.cash > 0 || t.tokens >= 0.05);
    return triggers.length ? { key: flash.key, triggers: triggers.slice(0, 3), more: triggers.length - 3 } : null;
  });

  const charmId = (source: string) => (source.startsWith('set:') ? null : source);
</script>

<!-- A row inside the result banner: the charms that added to this hand. -->
{#if shown}
  {#key shown.key}
    <div class="flash">
      {#each shown.triggers as t (t.source)}
        {@const id = charmId(t.source)}
        <span class="pill" class:set={!id}>
          {#if id}<span class="art"><CharmArt {id} /></span>{:else}<span class="star">★</span>{/if}
          <span class="name">{t.name}</span>
          {#if t.cash > 0}<b class="cash">+{formatMoney(t.cashMoney)}</b>{/if}
          {#if t.tokens >= 0.05}<b class="tok">+{formatGain(t.tokens)}</b>{/if}
        </span>
      {/each}
      {#if shown.more > 0}<span class="pill more">+{shown.more}</span>{/if}
    </div>
  {/key}
{/if}

<style>
  .flash {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 5px;
    margin-top: 3px;
    animation: in 300ms ease-out 120ms both;
  }
  @keyframes in {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }
  .pill {
    --art: 22px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 8px 2px 3px;
    border-radius: 999px;
    background: rgb(0 0 0 / 0.35);
    border: 1px solid rgb(242 198 78 / 0.5);
    font: 600 11px/1 var(--font-ui);
    white-space: nowrap;
  }
  .set {
    border-color: var(--gold);
    padding-left: 8px;
  }
  .star {
    color: var(--gold);
  }
  .name {
    color: var(--ink);
  }
  .cash {
    color: var(--win);
  }
  .tok {
    color: #f2d27a;
  }
  .tok::after {
    content: ' ◉';
    font-size: 9px;
  }
  .more {
    padding: 3px 9px;
    color: var(--muted);
  }
  @media (max-width: 420px) {
    .name {
      display: none;
    }
  }
</style>
