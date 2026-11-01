<script lang="ts">
  import { CHARMS, MAX_SLOTS, maxLevelOf, copiesFor } from '@idlesuits/sim';
  import { bankroll } from '../lib/casino.svelte';
  import { floor } from '../lib/floor.svelte';
  import { meta } from '../lib/meta.svelte';
  import { Decimal, formatMoney } from '../lib/money';
  import { room } from '../lib/rooms';
  import { KNOBS, tuning, TUNING_DEFAULTS } from '../lib/tuning.svelte';
  import { ui } from '../lib/ui.svelte';

  let dialog = $state<HTMLDialogElement>();

  $effect(() => {
    if (!dialog) return;
    if (ui.adminOpen && !dialog.open) {
      rooms = floor.best;
      dialog.showModal();
    }
    else if (!ui.adminOpen && dialog.open) dialog.close();
  });

  let bank = $state('');
  let tokens = $state(1000);
  let charm = $state(CHARMS[0]!.id);
  let copies = $state(1);
  let rooms = $state(floor.best);

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

<!--
  The pit boss: a testing panel, switched on in secret from the Settings panel
  (seven taps on its title) or by typing the word. Not part of the game.
-->
<dialog
  bind:this={dialog}
  class="admin"
  aria-labelledby="admin-title"
  onclose={() => (ui.adminOpen = false)}
  onclick={(e) => e.target === dialog && dialog.close()}
>
  <div class="body">
    <header>
      <h2 id="admin-title">Pit boss</h2>
      <button type="button" onclick={() => dialog?.close()} aria-label="Close">✕</button>
    </header>

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
      <h3>Rooms <span>open to {room(floor.best).name}</span></h3>
      <div class="row">
        <input type="number" min="0" max="40" step="1" bind:value={rooms} />
        <button type="button" onclick={() => floor.openTo(rooms)}>Open to room {rooms}</button>
      </div>
    </section>

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

    <section class="danger">
      <div class="row">
        <button type="button" onclick={wipe}>Wipe save</button>
        <button type="button" onclick={() => (ui.admin = false)}>Turn pit boss off</button>
      </div>
    </section>
  </div>
</dialog>

<style>
  .admin {
    width: min(460px, calc(100vw - 24px));
    max-height: calc(100dvh - 24px);
    padding: 0;
    border: 1px solid #ff7ad9;
    border-radius: 14px;
    background: var(--rail);
    color: var(--ink);
  }
  .admin::backdrop {
    background: rgb(0 0 0 / 0.6);
  }
  .body {
    display: grid;
    gap: 16px;
    padding: 14px 16px 18px;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
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
    grid-template-columns: 1fr 110px;
    align-items: center;
    gap: 10px;
    font: 13px/1.2 var(--font-ui);
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
</style>
