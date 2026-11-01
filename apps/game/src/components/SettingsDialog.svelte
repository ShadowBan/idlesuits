<script lang="ts">
  import { ui } from '../lib/ui.svelte';
  import CardStylePicker from './CardStylePicker.svelte';

  let dialog = $state<HTMLDialogElement>();

  // Opened from anywhere through `ui.settingsOpen`, so the lobby and every table share one panel.
  $effect(() => {
    if (!dialog) return;
    if (ui.settingsOpen && !dialog.open) dialog.showModal();
    else if (!ui.settingsOpen && dialog.open) dialog.close();
  });
</script>

<!-- Settings for the whole casino. A table's own controls stay in its sidebar. -->
<dialog
  bind:this={dialog}
  class="settings"
  aria-labelledby="settings-title"
  onclose={() => (ui.settingsOpen = false)}
  onclick={(e) => e.target === dialog && dialog.close()}
>
  <div class="body">
    <header>
      <h2 id="settings-title">Settings</h2>
      <button type="button" onclick={() => dialog?.close()} aria-label="Close">✕</button>
    </header>

    <section>
      <h3>Sound</h3>
      <label class="switch">
        <input type="checkbox" checked={!ui.muted} onchange={(e) => (ui.muted = !e.currentTarget.checked)} />
        Play sounds
      </label>
    </section>

    <section>
      <h3>Card faces</h3>
      <p class="note">Pick what is easiest to read. It applies at every table.</p>
      <CardStylePicker />
    </section>

    <p class="note">Everything is saved in this browser: your bank, Tokens, charms and each table's bets.</p>
  </div>
</dialog>

<style>
  .settings {
    width: min(440px, calc(100vw - 24px));
    max-height: calc(100dvh - 24px);
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--rail);
    color: var(--ink);
  }
  .settings::backdrop {
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
    color: var(--gold);
  }
  section {
    display: grid;
    gap: 8px;
  }
  h3 {
    margin: 0;
    font: 600 11px/1 var(--font-ui);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .note {
    margin: 0;
    font: 13px/1.4 var(--font-ui);
    color: var(--muted);
  }
  .switch {
    display: flex;
    align-items: center;
    gap: 8px;
    font: 14px/1.3 var(--font-ui);
  }
</style>
