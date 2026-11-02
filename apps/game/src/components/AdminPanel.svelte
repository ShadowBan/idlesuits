<script lang="ts">
  import { CHARMS, MAX_SLOTS, maxLevelOf, copiesFor } from '@idlesuits/sim';
  import { bankroll } from '../lib/casino.svelte';
  import { floor } from '../lib/floor.svelte';
  import { JACKPOT_SEEDS, jackpots, slotTest } from '../lib/jackpot.svelte';
  import { meta } from '../lib/meta.svelte';
  import { Decimal, formatMoney } from '../lib/money';
  import { room } from '../lib/rooms';
  import { GAMES } from '../lib/games';
  import { GAME_RULES, ruleKnobs } from '../lib/gameRules';
  import { route } from '../lib/route.svelte';
  import { KNOBS, tuning, TUNING_DEFAULTS } from '../lib/tuning.svelte';
  import { ui } from '../lib/ui.svelte';

  type Tab = 'player' | 'tuning' | 'rules' | 'save';
  const TABS: { id: Tab; label: string }[] = [
    { id: 'player', label: 'Player' },
    { id: 'tuning', label: 'Tuning' },
    { id: 'rules', label: 'Rules' },
    { id: 'save', label: 'Save' },
  ];
  let tab = $state<Tab>('player');

  // Each time it opens: the rooms box starts at the highest open, and the rules at the table you're at.
  $effect(() => {
    if (!ui.adminOpen) return;
    rooms = floor.best;
    if (GAME_RULES[route.current ?? '']) game = route.current!;
  });

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && ui.adminOpen) ui.adminOpen = false;
  }

  let bank = $state('');
  let tokens = $state(1000);
  let charm = $state(CHARMS[0]!.id);
  let copies = $state(1);
  let rooms = $state(floor.best);

  /** The game whose rules are shown: the table you're at, or the last one picked. */
  const tunable = GAMES.filter((g) => GAME_RULES[g.id]);
  let game = $state(GAME_RULES[route.current ?? ''] ? route.current! : 'blackjack');
  const knobs = $derived(ruleKnobs(game));
  const groups = $derived([...new Set(knobs.map((k) => k.group))]);
  const changedRules = $derived(Object.keys(tuning.games[game] ?? {}).length);

  function setBank() {
    try {
      const amount = new Decimal(bank.replace(/[$,\s]/g, ''));
      if (amount.isFinite()) bankroll.set(amount);
    } catch {
      // Not a number; nothing changes.
    }
  }

  /** Every charm at its top level. */
  function maxAll() {
    for (const c of CHARMS) {
      const want = copiesFor(maxLevelOf(c.id));
      const have = meta.collection[c.id] ?? 0;
      if (have < want) meta.grant(c.id, want - have);
    }
  }

  function wipe() {
    if (!confirm('Wipe the whole save (bank, Tokens, charms, tables) and start over?')) return;
    const clear = () => {
      for (const key of Object.keys(localStorage)) if (key.startsWith('idlesuits.')) localStorage.removeItem(key);
    };
    clear();
    // The page writes its state as it unloads; clear again after that, so the reload starts fresh.
    window.addEventListener('pagehide', clear, { once: true });
    location.reload();
  }
</script>

<svelte:window onkeydown={onKey} />

<!--
  The pit boss: a testing drawer on the right edge, switched on in secret from
  the Settings panel (seven taps on its title) or by typing the word, and
  opened from the marker on each table's felt. Not modal, so the table keeps
  playing while numbers change. Not part of the game.
-->
<aside class="admin" class:open={ui.adminOpen} aria-labelledby="admin-title" inert={!ui.adminOpen}>
  <header>
    <h2 id="admin-title">Pit boss</h2>
    <button type="button" onclick={() => (ui.adminOpen = false)} aria-label="Close">✕</button>
  </header>

  <div class="tabs" role="tablist" aria-label="Pit boss">
    {#each TABS as t (t.id)}
      <button type="button" role="tab" aria-selected={tab === t.id} onclick={() => (tab = t.id)}>
        {t.label}
        {#if t.id === 'tuning' && tuning.changed}<b>{tuning.changed}</b>{/if}
        {#if t.id === 'rules' && Object.keys(tuning.games).some((g) => Object.keys(tuning.games[g]!).length)}<b>•</b>{/if}
      </button>
    {/each}
  </div>

  <div class="body" role="tabpanel">
    {#if tab === 'player'}
      <section>
        <h3>Bank <span>{formatMoney(bankroll.balance)}</span></h3>
        <div class="row">
          <input type="text" inputmode="decimal" placeholder="e.g. 25000 or 1e12" bind:value={bank} />
          <button type="button" onclick={setBank}>Set</button>
        </div>
        <div class="row">
          <button type="button" onclick={() => bankroll.settle(new Decimal(1000))}>+$1K</button>
          <button type="button" onclick={() => bankroll.settle(new Decimal(100_000))}>+$100K</button>
          <button type="button" onclick={() => bankroll.set(bankroll.balance.mul(10))}>×10</button>
          <button type="button" onclick={() => bankroll.set(new Decimal(3))}>Bust</button>
        </div>
      </section>
      <section>
        <h3>Tokens <span>{Math.floor(meta.tokens).toLocaleString('en-US')}</span></h3>
        <div class="row">
          <input type="number" min="0" step="100" bind:value={tokens} />
          <button type="button" onclick={() => meta.grantTokens(tokens)}>Add</button>
          <button type="button" onclick={() => meta.grantTokens(-meta.tokens)}>Zero</button>
        </div>
      </section>
      <section>
        <h3>Charms <span>{meta.slots} of {MAX_SLOTS} slots</span></h3>
        <div class="row">
          <select bind:value={charm}>
            {#each CHARMS as c (c.id)}
              <option value={c.id}>{c.name} · {c.rarity} · have {meta.collection[c.id] ?? 0}</option>
            {/each}
          </select>
        </div>
        <div class="row">
          <input type="number" step="1" bind:value={copies} />
          <button type="button" onclick={() => meta.grant(charm, copies)}>Give copies</button>
          <button type="button" onclick={() => meta.equip(charm)}>Equip</button>
        </div>
        <div class="row">
          <button type="button" onclick={() => CHARMS.forEach((c) => meta.collection[c.id] || meta.grant(c.id, 1))}>
            One of each
          </button>
          <button type="button" onclick={maxAll}>Max all</button>
          <button type="button" onclick={() => meta.openAllSlots()}>Open slots</button>
        </div>
      </section>
      <section>
        <h3>Slots <span>Grand {jackpots.grand.toFixed(1)}× · Major {jackpots.major.toFixed(1)}×</span></h3>
        <div class="row">
          <button type="button" aria-pressed={slotTest.forceFeature} onclick={() => (slotTest.forceFeature = !slotTest.forceFeature)}>
            {slotTest.forceFeature ? 'Next spin: hold & spin ✓' : 'Next spin lands hold & spin'}
          </button>
        </div>
        <div class="row">
          <button type="button" onclick={() => jackpots.set('grand', jackpots.grand * 2)}>Grand ×2</button>
          <button type="button" onclick={() => jackpots.set('major', jackpots.major * 2)}>Major ×2</button>
          <button type="button" onclick={() => (jackpots.set('grand', JACKPOT_SEEDS.grand), jackpots.set('major', JACKPOT_SEEDS.major))}>Reset meters</button>
        </div>
      </section>
      <section>
        <h3>Rooms <span>open to {room(floor.best).name}</span></h3>
        <div class="row">
          <input type="number" min="0" max="40" step="1" bind:value={rooms} />
          <button type="button" onclick={() => floor.openTo(rooms)}>Open to room {rooms}</button>
        </div>
      </section>
    {:else if tab === 'tuning'}
      <section>
        <h3>Tuning <span>{tuning.changed ? `${tuning.changed} changed` : 'as designed'}</span></h3>
        <div class="knobs">
          {#each KNOBS as knob (knob.key)}
            <label class:changed={tuning.values[knob.key] !== TUNING_DEFAULTS[knob.key]}>
              <span class="name">{knob.label}<small>{knob.hint}</small></span>
              <input
                type="number"
                min={knob.min}
                max={knob.max}
                step={knob.step}
                value={tuning.values[knob.key]}
                onchange={(e) => tuning.set(knob.key, Number(e.currentTarget.value))}
              />
            </label>
          {/each}
        </div>
        <p class="note">Room changes apply to new hands; a room opened stays open.</p>
        <div class="row">
          <button type="button" onclick={() => tuning.reset()}>Reset tuning</button>
        </div>
      </section>
    {:else if tab === 'rules'}
      <section>
        <h3>Game rules <span>{changedRules ? `${changedRules} changed` : 'as designed'}</span></h3>
        <div class="row">
          <select bind:value={game}>
            {#each tunable as g (g.id)}
              <option value={g.id}>{g.name}{tuning.games[g.id] && Object.keys(tuning.games[g.id]!).length ? ' ·  changed' : ''}</option>
            {/each}
          </select>
          <button type="button" onclick={() => tuning.resetGame(game)}>Reset</button>
        </div>
        {#each groups as group (group)}
          <div class="knobs">
            <h4>{group}</h4>
            {#each knobs.filter((k) => k.group === group) as knob (knob.path)}
              {@const value = tuning.gameValue(game, knob.path, knob.value)}
              <label class:changed={value !== knob.value}>
                <span class="name">{knob.label}{#if knob.hint}<small>{knob.hint}</small>{/if}</span>
                {#if typeof knob.value === 'boolean'}
                  <input
                    type="checkbox"
                    checked={value as boolean}
                    onchange={(e) => tuning.setRule(game, knob.path, e.currentTarget.checked, knob.value)}
                  />
                {:else}
                  <input
                    type="number"
                    step="any"
                    min={knob.min ?? 0}
                    max={knob.max}
                    value={value as number}
                    onchange={(e) => tuning.setRule(game, knob.path, Number(e.currentTarget.value), knob.value)}
                  />
                {/if}
              </label>
            {/each}
          </div>
        {/each}
        <p class="note">
          Changes apply from the next hand. A Blackjack shoe with a different number of decks is shuffled before the next
          hand. Strategy charts, suggestions and the house edges shown assume the rules as designed, except Blackjack's,
          which is solved again.
        </p>
      </section>
    {:else}
      <section>
        <h3>Save</h3>
        <p class="note">
          Tuning and rule changes are kept in this browser until reset. Wiping clears the whole save: bank, Tokens,
          charms, rooms and every table, and starts over.
        </p>
      </section>
      <section class="danger">
        <div class="row">
          <button type="button" onclick={wipe}>Wipe save</button>
          <button type="button" onclick={() => (ui.admin = false)}>Turn pit boss off</button>
        </div>
      </section>
    {/if}
  </div>
</aside>

<style>
  /* A drawer on the right edge: slides out over the table without blocking it. */
  .admin {
    position: fixed;
    z-index: 50;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(560px, 100vw);
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    background: var(--rail);
    color: var(--ink);
    border-left: 2px solid #ff7ad9;
    box-shadow: -12px 0 30px rgb(0 0 0 / 0.5);
    transform: translateX(100%);
    visibility: hidden;
    transition:
      transform 240ms cubic-bezier(0.2, 0.8, 0.3, 1),
      visibility 0s 240ms;
  }
  .admin.open {
    transform: none;
    visibility: visible;
    transition: transform 240ms cubic-bezier(0.2, 0.8, 0.3, 1);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px 10px;
  }
  .tabs {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
    margin: 0 16px;
    padding: 4px;
    border-radius: 12px;
    background: rgb(0 0 0 / 0.25);
  }
  .tabs button {
    min-height: 36px;
    border: 0;
    border-radius: 8px;
    background: none;
    font: 600 12px/1 var(--font-ui);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .tabs button[aria-selected='true'] {
    background: #ff7ad9;
    color: #1a0d16;
  }
  .tabs b {
    margin-left: 4px;
    color: #ff7ad9;
  }
  .tabs button[aria-selected='true'] b {
    color: inherit;
  }
  .body {
    overflow-y: auto;
    overscroll-behavior: contain;
    display: grid;
    align-content: start;
    gap: 18px;
    padding: 16px 16px calc(24px + env(safe-area-inset-bottom));
  }
  h2 {
    margin: 0;
    font: 700 18px/1 var(--font-display);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #ff7ad9;
  }
  section {
    display: grid;
    gap: 8px;
  }
  h3 {
    margin: 0;
    display: flex;
    justify-content: space-between;
    font: 600 11px/1 var(--font-ui);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
  }
  h3 span {
    letter-spacing: 0;
    text-transform: none;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .row input,
  .row select {
    flex: 1;
    min-width: 0;
  }
  input,
  select {
    min-height: 36px;
    padding: 6px 8px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: rgb(0 0 0 / 0.3);
    color: var(--ink);
    font: 14px/1.2 var(--font-ui);
  }
  .knobs {
    display: grid;
    gap: 6px;
  }
  .knobs label {
    display: grid;
    grid-template-columns: 1fr 130px;
    align-items: center;
    gap: 10px;
    font: 13px/1.2 var(--font-ui);
  }
  .knobs h4 {
    margin: 6px 0 0;
    font: 600 11px/1 var(--font-ui);
    color: var(--gold);
  }
  .knobs input[type='checkbox'] {
    justify-self: end;
    width: 22px;
    min-height: 22px;
  }
  .knobs label.changed .name {
    color: #ff7ad9;
  }
  .name {
    display: grid;
    gap: 2px;
  }
  .name small {
    color: var(--muted);
    font-size: 11px;
  }
  .note {
    margin: 0;
    font: 12px/1.4 var(--font-ui);
    color: var(--muted);
  }
  .danger {
    padding-top: 12px;
    border-top: 1px solid var(--line);
  }
  /* Wide enough for two columns of settings. */
  @media (min-width: 600px) {
    .knobs {
      grid-template-columns: 1fr 1fr;
      column-gap: 18px;
    }
    .knobs h4 {
      grid-column: 1 / -1;
    }
  }
</style>
