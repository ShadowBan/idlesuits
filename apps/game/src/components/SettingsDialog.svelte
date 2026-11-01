<script lang="ts">
  import { ui } from '../lib/ui.svelte';
  import CardStylePicker from './CardStylePicker.svelte';

  let dialog = $state<HTMLDialogElement>();

  /**
   * The admin panel's secret switch: seven quick taps on the title. Nothing
   * hints at it until it flips, and the same seven taps flip it back.
   */
  const TAPS = 7;
  const TAP_GAP_MS = 600;
  let taps = 0;
  let lastTap = 0;
  let notice = $state<string | null>(null);
  function tapTitle() {
    const now = performance.now();
    taps = now - lastTap < TAP_GAP_MS ? taps + 1 : 1;
    lastTap = now;
    if (taps < TAPS) return;
    taps = 0;
    ui.admin = !ui.admin;
    notice = ui.admin ? 'Pit boss mode on' : 'Pit boss mode off';
    setTimeout(() => (notice = null), 2000);
  }

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
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
      <h2 id="settings-title" onclick={tapTitle}>Settings</h2>
      {#if notice}<span class="notice">{notice}</span>{/if}
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

    {#if ui.admin}
      <button type="button" class="pitboss" onclick={() => ((ui.adminOpen = true), dialog?.close())}>Pit boss</button>
    {/if}
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
    gap: 10px;
  }
  h2 {
    margin: 0 auto 0 0;
    user-select: none;
    -webkit-user-select: none;
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
  .notice {
    font: 600 12px/1 var(--font-ui);
    color: var(--gold);
  }
  .pitboss {
    justify-self: start;
    border-color: #ff7ad9;
    color: #ff7ad9;
  }
  .switch {
    display: flex;
    align-items: center;
    gap: 8px;
    font: 14px/1.3 var(--font-ui);
  }
</style>
