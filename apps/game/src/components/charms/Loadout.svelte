<script lang="ts">
  import { describeEffect, findCharm, MAX_SLOTS } from '@idlesuits/sim';
  import { meta } from '../../lib/meta.svelte';
  import { RARITY_COLOR } from './art';
  import CharmArt from './CharmArt.svelte';
  import { formatTokens } from './format';

  interface Props {
    /** A charm in a slot was tapped. */
    onPick?: (id: string) => void;
    /** Compact: art only, for a table's side panel. */
    compact?: boolean;
  }

  let { onPick, compact = false }: Props = $props();

  const locked = $derived(MAX_SLOTS - meta.slots);
</script>

<div class="loadout" class:compact>
  {#each meta.loadout as id, slot (slot)}
    {@const def = id ? findCharm(id) : undefined}
    {#if def && id}
      <button type="button" class="slot filled" style:--rarity={RARITY_COLOR[def.rarity]} onclick={() => onPick?.(id)}>
        <CharmArt {id} />
        {#if !compact}
          <span class="name">{def.name}</span>
          <span class="lv">Lv {meta.levelOf(id)}</span>
        {/if}
      </button>
    {:else}
      <div class="slot empty">{compact ? '' : 'Empty'}</div>
    {/if}
  {/each}
  {#each Array.from({ length: locked }, (_, i) => i) as i (i)}
    {#if i === 0 && meta.nextSlotCost !== null && !compact}
      <button
        type="button"
        class="slot buy"
        disabled={meta.tokens < meta.nextSlotCost}
        onclick={() => meta.buySlot()}
        title="Unlock another charm slot"
      >
        <span class="plus">+</span>
        <span class="price">◉ {formatTokens(meta.nextSlotCost)}</span>
      </button>
    {:else}
      <div class="slot locked" aria-label="Locked slot">🔒</div>
    {/if}
  {/each}
</div>

{#if compact}
  <ul class="lines">
    {#each meta.equipped as e (e.id)}
      {@const def = findCharm(e.id)!}
      <li><b>{def.name}</b> {def.effects.map((effect) => describeEffect(effect, e.level)).join(' · ')}</li>
    {:else}
      <li class="none">No charms on. Pull some at the Charm Machine.</li>
    {/each}
  </ul>
{/if}

<style>
  .loadout {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 8px;
  }
  .slot {
    --art: 44px;
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 3px;
    aspect-ratio: 1 / 1.15;
    min-width: 0;
    min-height: 0;
    padding: 6px 2px;
    border-radius: 14px;
    border: 2px dashed rgb(255 255 255 / 0.14);
    background: rgb(0 0 0 / 0.22);
    color: var(--muted);
    font: 600 11px/1 var(--font-ui);
  }
  .filled {
    border: 2px solid var(--rarity);
    background: radial-gradient(circle at 50% 35%, color-mix(in srgb, var(--rarity) 22%, transparent), rgb(0 0 0 / 0.25) 70%);
    color: var(--ink);
  }
  .name {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .lv {
    color: var(--rarity);
    font-size: 10px;
  }
  .buy {
    border-style: solid;
    border-color: rgb(242 198 78 / 0.5);
    color: #f2d27a;
  }
  .plus {
    font: 700 22px/1 var(--font-display);
  }
  .price {
    font-size: 11px;
  }
  .locked {
    font-size: 16px;
    opacity: 0.5;
  }
  .compact {
    gap: 5px;
  }
  .compact .slot {
    --art: 30px;
    aspect-ratio: 1;
    padding: 3px;
    border-radius: 10px;
  }
  .lines {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 4px;
    font: 12px/1.35 var(--font-ui);
    color: var(--muted);
  }
  .lines b {
    color: var(--ink);
    font-weight: 600;
  }
</style>
