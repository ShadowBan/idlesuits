<script lang="ts">
  import { describeEffect, findCharm, MAX_SLOTS } from '@idlesuits/sim';
  import { meta } from '../../lib/meta.svelte';
  import { RARITY_COLOR } from './art';
  import CharmArt from './CharmArt.svelte';
  import { formatTokens } from './format';

  /** The charm whose bonuses are showing: hovered, focused or tapped. */
  let open = $state<number | null>(null);
  const locked = $derived(MAX_SLOTS - meta.slots);
</script>

<!--
  The charms on, always in view at a table: just their art, with what each
  does in a tooltip (hover, focus or tap).
-->
<div class="strip">
  <div class="slots">
    {#each meta.loadout as id, slot (slot)}
      {@const def = id ? findCharm(id) : undefined}
      {#if def && id}
        {@const level = meta.levelOf(id)}
        <span class="holder">
          <button
            type="button"
            class="charm"
            style:--rarity={RARITY_COLOR[def.rarity]}
            aria-label="{def.name}, level {level}"
            aria-describedby="charm-tip-{slot}"
            aria-expanded={open === slot}
            onmouseenter={() => (open = slot)}
            onmouseleave={() => open === slot && (open = null)}
            onfocus={() => (open = slot)}
            onblur={() => open === slot && (open = null)}
            onclick={() => (open = open === slot ? null : slot)}
          >
            <CharmArt {id} />
          </button>
          <span class="tip" class:show={open === slot} class:left={slot < 2} class:right={slot > 2} role="tooltip" id="charm-tip-{slot}">
            <b style:color={RARITY_COLOR[def.rarity]}>{def.name} <small>Lv {level}</small></b>
            {#each def.effects as effect, i (i)}<span>{describeEffect(effect, level)}</span>{/each}
          </span>
        </span>
      {:else}
        <span class="charm empty" aria-label="Empty slot"></span>
      {/if}
    {/each}
    {#each { length: locked } as _, i (i)}
      <span class="charm locked" aria-label="Locked slot"></span>
    {/each}
  </div>
  <a href="#/charms" class="machine" title="The Charm Machine">◉ {formatTokens(meta.tokens)}</a>
</div>

<style>
  .strip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .slots {
    display: flex;
    gap: 5px;
  }
  .holder {
    position: relative;
  }
  .charm {
    --art: 28px;
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    min-height: 0;
    padding: 0;
    border-radius: 10px;
    border: 2px solid var(--rarity, rgb(255 255 255 / 0.14));
    background: radial-gradient(circle at 50% 35%, color-mix(in srgb, var(--rarity, transparent) 22%, transparent), rgb(0 0 0 / 0.25) 70%);
  }
  .charm.empty {
    border-style: dashed;
    background: rgb(0 0 0 / 0.2);
  }
  .charm.locked {
    border: 2px solid rgb(255 255 255 / 0.05);
    background: rgb(0 0 0 / 0.3);
    opacity: 0.6;
  }
  .tip {
    position: absolute;
    top: calc(100% + 6px);
    left: 50%;
    translate: -50% 0;
    z-index: 20;
    display: none;
    gap: 3px;
    width: 220px;
    padding: 8px 10px;
    border-radius: 10px;
    background: #14100c;
    box-shadow:
      0 8px 24px rgb(0 0 0 / 0.6),
      inset 0 0 0 1px var(--line);
    font: 12px/1.35 var(--font-ui);
    color: var(--ink);
    pointer-events: none;
  }
  .tip.left {
    left: 0;
    translate: 0 0;
  }
  .tip.right {
    left: auto;
    right: 0;
    translate: 0 0;
  }
  .tip.show {
    display: grid;
  }
  .tip b {
    font: 600 13px/1.2 var(--font-ui);
  }
  .tip small {
    color: var(--muted);
    font-weight: 400;
  }
  .tip span {
    color: var(--muted);
  }
  .machine {
    flex: none;
    padding: 6px 10px;
    border-radius: 999px;
    background: rgb(242 198 78 / 0.12);
    font: 600 12px/1 var(--font-ui);
    color: #f2d27a;
    text-decoration: none;
    white-space: nowrap;
  }
  .machine:hover {
    background: rgb(242 198 78 / 0.22);
  }
</style>
