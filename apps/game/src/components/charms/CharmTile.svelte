<script lang="ts">
  import { findCharm, maxLevelOf, nextLevel } from '@idlesuits/sim';
  import { RARITY_COLOR } from './art';
  import CharmArt from './CharmArt.svelte';

  interface Props {
    id: string;
    /** Copies found; zero shows the silhouette. */
    copies: number;
    level: number;
    equipped?: boolean;
    onclick?: () => void;
    size?: 'md' | 'sm';
  }

  let { id, copies, level, equipped = false, onclick, size = 'md' }: Props = $props();

  const def = $derived(findCharm(id)!);
  const owned = $derived(copies > 0);
  const progress = $derived(nextLevel(copies, maxLevelOf(id)));
</script>

<button
  type="button"
  class="tile {size}"
  class:owned
  class:equipped
  style:--rarity={RARITY_COLOR[def.rarity]}
  {onclick}
  aria-label={owned ? `${def.name}, level ${level}` : 'Not found yet'}
>
  <span class="art"><CharmArt {id} hidden={!owned} /></span>
  {#if owned}
    <span class="name">{def.name}</span>
    <span class="level">{level >= maxLevelOf(id) ? 'Max' : `Lv ${level}`}</span>
    <span class="bar" aria-hidden="true">
      <span class="fill" style:width="{progress ? (progress.have / progress.need) * 100 : 100}%"></span>
    </span>
  {:else}
    <span class="name unknown">???</span>
  {/if}
</button>

<style>
  .tile {
    --art: 46px;
    position: relative;
    display: grid;
    justify-items: center;
    align-content: start;
    gap: 3px;
    width: 100%;
    min-width: 0;
    min-height: 0;
    padding: 8px 4px 7px;
    border-radius: 12px;
    border: 2px solid color-mix(in srgb, var(--rarity) 35%, transparent);
    background: radial-gradient(circle at 50% 30%, color-mix(in srgb, var(--rarity) 18%, transparent), rgb(0 0 0 / 0.25) 70%);
    color: var(--ink);
    transition:
      transform 140ms ease,
      border-color 140ms ease;
  }
  .tile:hover:not(:disabled) {
    background: radial-gradient(circle at 50% 30%, color-mix(in srgb, var(--rarity) 28%, transparent), rgb(0 0 0 / 0.25) 70%);
    transform: translateY(-2px);
  }
  .tile:not(.owned) {
    border-style: dashed;
    border-color: rgb(255 255 255 / 0.1);
    background: rgb(0 0 0 / 0.2);
  }
  .equipped {
    border-color: var(--gold);
    box-shadow: 0 0 0 1px var(--gold);
  }
  .equipped::after {
    content: '✓';
    position: absolute;
    top: 4px;
    right: 6px;
    font: 700 11px/1 var(--font-ui);
    color: var(--gold);
  }
  .sm {
    --art: 34px;
    padding: 6px 2px 5px;
  }
  .art {
    display: grid;
    place-items: center;
    height: var(--art);
  }
  .name {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font: 600 11px/1.2 var(--font-ui);
  }
  .unknown {
    color: var(--muted);
  }
  .level {
    font: 700 10px/1 var(--font-ui);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--rarity);
  }
  .bar {
    width: 70%;
    height: 3px;
    border-radius: 2px;
    background: rgb(255 255 255 / 0.1);
    overflow: hidden;
  }
  .fill {
    display: block;
    height: 100%;
    background: var(--rarity);
  }
  .sm .name,
  .sm .bar {
    display: none;
  }
</style>
