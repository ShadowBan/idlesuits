<script lang="ts">
  import { describeEffect, findCharm, maxLevelOf, nextLevel, setOf } from '@idlesuits/sim';
  import { meta } from '../../lib/meta.svelte';
  import { RARITY_COLOR } from './art';
  import CharmArt from './CharmArt.svelte';

  /** Opened on a charm; closes itself. */
  let dialog = $state<HTMLDialogElement>();
  let id = $state<string | null>(null);

  export function open(charm: string) {
    id = charm;
    dialog?.showModal();
  }

  const def = $derived(id ? findCharm(id) : undefined);
  const copies = $derived(id ? (meta.collection[id] ?? 0) : 0);
  const level = $derived(id ? meta.levelOf(id) : 0);
  const maxLevel = $derived(id ? maxLevelOf(id) : 10);
  const progress = $derived(nextLevel(copies, maxLevel));
  const set = $derived(id ? setOf(id) : undefined);
  const equipped = $derived(id ? meta.isEquipped(id) : false);
  const full = $derived(!meta.loadout.includes(null));

  function equip(slot?: number) {
    if (id && meta.equip(id, slot)) dialog?.close();
  }
</script>

<dialog bind:this={dialog} class="detail" onclick={(e) => e.target === dialog && dialog.close()}>
  {#if def && id}
    <div class="body" style:--rarity={RARITY_COLOR[def.rarity]}>
      <button type="button" class="x" onclick={() => dialog?.close()} aria-label="Close">✕</button>
      <div class="art"><CharmArt {id} hidden={copies === 0} /></div>
      {#if copies > 0}
        <h2>{def.name}</h2>
        <p class="rarity">{def.rarity} · {level >= maxLevel ? 'max level' : `level ${level}`}</p>
        <p class="flavor">“{def.flavor}”</p>

        <ul class="effects">
          {#each def.effects as effect, i (i)}
            <li>
              <span>{describeEffect(effect, level)}</span>
              {#if level < maxLevel}<small>Next level: {describeEffect(effect, level + 1)}</small>{/if}
            </li>
          {/each}
        </ul>
        {#if def.where}<p class="where">Works at: {def.where}</p>{/if}

        <div class="copies">
          {#if progress}
            <span>{progress.have} / {progress.need} copies to level {level + 1}</span>
            <span class="bar"><span class="fill" style:width="{(progress.have / progress.need) * 100}%"></span></span>
          {:else}
            <span>{copies} copies · fully levelled</span>
          {/if}
        </div>

        {#if set}
          <p class="set">Part of <b>{set.name}</b>: {set.blurb}</p>
        {/if}

        <div class="actions">
          {#if equipped}
            <button type="button" onclick={() => id && meta.unequip(id)}>Take off</button>
          {:else if !full}
            <button type="button" class="primary" onclick={() => equip()}>Equip</button>
          {:else}
            <p class="swap">Your slots are full. Swap it for:</p>
            <div class="slots">
              {#each meta.loadout as other, slot (slot)}
                {#if other}
                  <button type="button" class="swap-slot" onclick={() => equip(slot)} title={findCharm(other)?.name}>
                    <CharmArt id={other} />
                  </button>
                {/if}
              {/each}
            </div>
          {/if}
        </div>
      {:else}
        <h2>Not found yet</h2>
        <p class="rarity">{def.rarity}</p>
        <p class="flavor">Keep pulling. It’s in the machine somewhere.</p>
      {/if}
    </div>
  {/if}
</dialog>

<style>
  .detail {
    width: min(380px, calc(100vw - 24px));
    padding: 0;
    border: 0;
    border-radius: 18px;
    background: transparent;
    color: var(--ink);
  }
  .detail::backdrop {
    background: rgb(0 0 0 / 0.65);
  }
  .body {
    --art: 112px;
    position: relative;
    display: grid;
    justify-items: center;
    gap: 8px;
    padding: 22px 18px 18px;
    border-radius: 18px;
    border: 2px solid var(--rarity);
    background:
      radial-gradient(circle at 50% 18%, color-mix(in srgb, var(--rarity) 25%, transparent), transparent 55%),
      var(--rail);
    text-align: center;
  }
  .x {
    position: absolute;
    top: 8px;
    right: 8px;
  }
  h2 {
    margin: 4px 0 0;
    font: 700 22px/1 var(--font-display);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .rarity {
    margin: 0;
    font: 700 11px/1 var(--font-ui);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--rarity);
  }
  .flavor {
    margin: 0;
    font: italic 13px/1.4 var(--font-ui);
    color: var(--muted);
  }
  .effects {
    list-style: none;
    margin: 4px 0 0;
    padding: 0;
    display: grid;
    gap: 6px;
    width: 100%;
  }
  .effects li {
    display: grid;
    gap: 2px;
    padding: 8px 10px;
    border-radius: 10px;
    background: rgb(0 0 0 / 0.25);
    font: 600 14px/1.3 var(--font-ui);
  }
  .effects small {
    font: 500 11px/1.3 var(--font-ui);
    color: var(--muted);
  }
  .where,
  .set {
    margin: 0;
    font: 12px/1.4 var(--font-ui);
    color: var(--muted);
  }
  .set b {
    color: var(--gold);
  }
  .copies {
    display: grid;
    gap: 4px;
    width: 100%;
    font: 12px/1 var(--font-ui);
    color: var(--muted);
  }
  .bar {
    height: 5px;
    border-radius: 3px;
    background: rgb(255 255 255 / 0.1);
    overflow: hidden;
  }
  .fill {
    display: block;
    height: 100%;
    background: var(--rarity);
  }
  .actions {
    display: grid;
    justify-items: center;
    gap: 6px;
    margin-top: 4px;
  }
  .actions > button {
    min-width: 140px;
    min-height: 40px;
  }
  .swap {
    margin: 0;
    font: 12px/1 var(--font-ui);
    color: var(--muted);
  }
  .slots {
    display: flex;
    gap: 6px;
  }
  .swap-slot {
    --art: 34px;
    padding: 4px;
  }
</style>
