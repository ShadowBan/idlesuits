<script lang="ts">
  import { CHARM_SETS, CHARMS, describeEffect, RARITIES, RARITY_WEIGHTS, SECRET_ODDS } from '@idlesuits/sim';
  import { meta } from '../../lib/meta.svelte';
  import BankCounter from '../BankCounter.svelte';
  import { bankroll } from '../../lib/casino.svelte';
  import { RARITY_COLOR } from './art';
  import CapsuleMachine from './CapsuleMachine.svelte';
  import CharmArt from './CharmArt.svelte';
  import CharmDetail from './CharmDetail.svelte';
  import CharmTile from './CharmTile.svelte';
  import { formatTokens } from './format';
  import Loadout from './Loadout.svelte';
  import TokenCounter from './TokenCounter.svelte';

  let { onExit }: { onExit: () => void } = $props();

  let detail = $state<CharmDetail>();
  const open = (id: string) => detail?.open(id);

  const found = $derived(CHARMS.filter((c) => (meta.collection[c.id] ?? 0) > 0).length);
  const byRarity = $derived(
    RARITIES.map((rarity) => {
      const charms = CHARMS.filter((c) => c.rarity === rarity);
      return { rarity, charms, found: charms.filter((c) => (meta.collection[c.id] ?? 0) > 0).length };
    }),
  );
  const sets = $derived(
    CHARM_SETS.map((set) => {
      const levels = set.members.map((m) => meta.levelOf(m));
      const active = set.members.every((m) => meta.isEquipped(m));
      const level = Math.min(...levels.map((l) => Math.max(l, 1)));
      return { set, active, level, owned: levels.filter((l) => l > 0).length };
    }),
  );
</script>

<CharmDetail bind:this={detail} />

<div class="page">
  <header class="bar">
    <button type="button" onclick={onExit} aria-label="Back to the floor">←</button>
    <h1>Charm <span>Machine</span></h1>
    <div class="money">
      <BankCounter bank={bankroll.balance} />
      <TokenCounter href="#/charms" />
    </div>
  </header>

  <div class="top">
    <section class="panel machine">
      <CapsuleMachine onPick={open} />
      <details class="odds">
        <summary>Odds</summary>
        <ul>
          {#each RARITIES as r (r)}
            <li style:color={RARITY_COLOR[r]}>
              {#if r === 'secret'}
                <span>{r}</span><span>{+(Math.max(...Object.values(SECRET_ODDS)) * 100).toPrecision(2)}% each</span>
              {:else}
                <span>{r}</span><span>{+(RARITY_WEIGHTS[r] * 100).toFixed(1)}%</span>
              {/if}
            </li>
          {/each}
        </ul>
        <p>A duplicate levels its charm up. Each level takes as many copies again as all the levels before it.</p>
      </details>
    </section>

    <section class="panel">
      <h2>Equipped <span>works at every table</span></h2>
      <Loadout onPick={open} />
      <p class="note">Tap a charm in your collection to equip it. More slots unlock with Tokens.</p>

      <h2 class="sets-title">Sets <span>all three equipped for a bonus</span></h2>
      <ul class="sets">
        {#each sets as { set, active, level, owned } (set.id)}
          <li class:active>
            <div class="members">
              {#each set.members as m (m)}
                <button type="button" class="member" onclick={() => open(m)}>
                  <CharmArt id={m} hidden={!meta.collection[m]} />
                </button>
              {/each}
            </div>
            <div class="set-text">
              <b>{set.name}</b>
              <span>{set.bonus.map((e) => describeEffect(e, level)).join(' · ')}</span>
              <small>{active ? 'Active' : `${owned} of 3 found`}</small>
            </div>
          </li>
        {/each}
      </ul>
    </section>
  </div>

  <section class="panel">
    <h2>Collection <span>{found} of {CHARMS.length} found · {meta.pulls} pulls · {formatTokens(meta.lifetimeTokens)} Tokens won</span></h2>
    {#each byRarity as group (group.rarity)}
      <h3 style:color={RARITY_COLOR[group.rarity]}>{group.rarity} <span>{group.found}/{group.charms.length}</span></h3>
      <div class="grid">
        {#each group.charms as c (c.id)}
          <CharmTile
            id={c.id}
            copies={meta.collection[c.id] ?? 0}
            level={meta.levelOf(c.id)}
            equipped={meta.isEquipped(c.id)}
            onclick={() => open(c.id)}
          />
        {/each}
      </div>
    {/each}
  </section>
</div>

<style>
  .page {
    max-width: 1100px;
    margin: 0 auto;
    padding: 12px 12px calc(32px + env(safe-area-inset-bottom));
    display: grid;
    gap: 12px;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    border-radius: 12px;
    background: var(--rail);
  }
  h1 {
    margin: 0 auto 0 0;
    font: 700 22px/1 var(--font-display);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  h1 span {
    color: var(--gold);
  }
  .money {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .top {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr);
    gap: 12px;
  }
  @media (max-width: 760px) {
    .top {
      grid-template-columns: minmax(0, 1fr);
    }
    h1 {
      font-size: 18px;
    }
  }
  .panel {
    display: grid;
    align-content: start;
    gap: 10px;
    padding: 14px;
    border-radius: 14px;
    background: var(--rail);
  }
  .machine {
    justify-items: center;
    background: radial-gradient(circle at 50% 35%, #2a1d14, var(--rail) 70%);
  }
  h2 {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 4px 10px;
    font: 600 11px/1.2 var(--font-ui);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
  }
  h2 span {
    letter-spacing: 0;
    text-transform: none;
    font-weight: 400;
  }
  .sets-title {
    margin-top: 8px;
  }
  h3 {
    margin: 8px 0 0;
    font: 700 13px/1 var(--font-display);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  h3 span {
    color: var(--muted);
    font-weight: 500;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
    gap: 8px;
  }
  .note {
    margin: 0;
    font: 12px/1.4 var(--font-ui);
    color: var(--muted);
  }
  .odds {
    width: 100%;
    font: 12px/1.4 var(--font-ui);
    color: var(--muted);
  }
  .odds summary {
    cursor: pointer;
    font-weight: 600;
  }
  .odds ul {
    list-style: none;
    margin: 6px 0;
    padding: 0;
    display: grid;
    gap: 2px;
  }
  .odds li {
    display: flex;
    justify-content: space-between;
    text-transform: capitalize;
  }
  .odds p {
    margin: 0;
  }
  .sets {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  .sets li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px;
    border-radius: 12px;
    border: 1px solid rgb(255 255 255 / 0.08);
    background: rgb(0 0 0 / 0.2);
  }
  .sets li.active {
    border-color: var(--gold);
    box-shadow: 0 0 14px rgb(232 182 76 / 0.25);
  }
  .members {
    display: flex;
    gap: 4px;
  }
  .member {
    --art: 32px;
    padding: 3px;
    min-height: 0;
    min-width: 0;
    border-radius: 10px;
  }
  .set-text {
    display: grid;
    gap: 2px;
    min-width: 0;
    font: 12px/1.3 var(--font-ui);
    color: var(--muted);
  }
  .set-text b {
    color: var(--ink);
    font-size: 13px;
  }
  .set-text small {
    color: var(--gold);
    font-weight: 600;
  }
</style>
