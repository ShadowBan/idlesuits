<script lang="ts">
  import { account } from '../lib/account.svelte';
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

  // The account: sign in or create one, and how the cloud save stands.
  let mode = $state<'signin' | 'signup'>('signup');
  let email = $state('');
  let password = $state('');
  let name = $state('');
  let busy = $state(false);
  let failed = $state<string | null>(null);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    busy = true;
    failed = null;
    try {
      if (mode === 'signup') await account.signUp(email, password, name);
      else await account.signIn(email, password);
      password = '';
    } catch (err) {
      failed = err instanceof Error ? err.message : 'That didn’t work.';
    } finally {
      busy = false;
    }
  }

  const since = (at: number | null) => {
    if (!at) return '';
    const s = Math.round((Date.now() - at) / 1000);
    return s < 10 ? 'just now' : s < 60 ? `${s}s ago` : `${Math.round(s / 60)} min ago`;
  };
  const STATUS: Record<string, string> = {
    checking: 'Checking…',
    syncing: 'Saving to your account…',
    synced: 'Saved to your account',
    error: 'Couldn’t reach the server; it will try again',
    conflict: 'Played on another device: choose which progress to keep',
    local: '',
  };

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

    <section class="account">
      <h3>Players Club</h3>
      {#if account.notice}<p class="notice-line">{account.notice}</p>{/if}
      {#if account.user}
        <div class="who">
          <div>
            <b>{account.user.name}</b>
            <span>{account.user.email}{account.admin ? ' · pit boss' : ''}</span>
          </div>
          <a class="profile" href="#/club" onclick={() => dialog?.close()}>Profile</a>
          <button type="button" onclick={() => account.signOut()}>Sign out</button>
        </div>
        <p class="note" class:bad={account.status === 'error'}>
          {STATUS[account.status]}{account.status === 'synced' && account.lastSync ? ` · ${since(account.lastSync)}` : ''}. As a member, your bank,
          Tokens, charms and every table's progress follow you to any device you sign in on.
        </p>
      {:else if account.online}
        <div class="modes" role="tablist" aria-label="Account">
          <button type="button" role="tab" aria-selected={mode === 'signup'} onclick={() => ((mode = 'signup'), (failed = null))}>Join</button>
          <button type="button" role="tab" aria-selected={mode === 'signin'} onclick={() => ((mode = 'signin'), (failed = null))}>Members sign in</button>
        </div>
        <form onsubmit={submit}>
          {#if mode === 'signup'}
            <label>Name on your card <input type="text" bind:value={name} maxlength="32" autocomplete="nickname" placeholder="What the casino calls you" /></label>
          {/if}
          <label>Email <input type="email" bind:value={email} required autocomplete="email" /></label>
          <label
            >Password <input
              type="password"
              bind:value={password}
              required
              minlength={mode === 'signup' ? 8 : undefined}
              autocomplete={mode === 'signup' ? 'new-password' : 'current-password'}
            /></label
          >
          {#if failed}<p class="error">{failed}</p>{/if}
          <button type="submit" class="primary" disabled={busy}>{busy ? 'One moment…' : mode === 'signup' ? 'Join the Players Club' : 'Sign in'}</button>
        </form>
        <p class="note">
          {mode === 'signup'
            ? 'Free to join. Your progress in this browser comes with you, saved to your membership, with your own profile and stats.'
            : 'Signing in loads your membership’s progress here, in place of this browser’s.'}
        </p>
      {:else if account.status === 'checking'}
        <p class="note">Checking…</p>
      {:else}
        <p class="note">You're playing as a guest: your bank, Tokens, charms and each table's bets are saved in this browser.</p>
      {/if}
    </section>

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
  /* The account: who's signed in, or the form to sign in. */
  .account .who {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 10px;
    background: rgb(255 255 255 / 0.04);
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .account .who div {
    display: grid;
    gap: 3px;
    min-width: 0;
  }
  .account .who b {
    font: 600 15px/1.2 var(--font-ui);
  }
  .account .who span {
    font: 12px/1.2 var(--font-ui);
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .modes {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3px;
    padding: 3px;
    border-radius: 10px;
    background: rgb(0 0 0 / 0.25);
  }
  .modes button {
    min-height: 32px;
    border: 0;
    border-radius: 8px;
    background: none;
    font: 600 13px/1 var(--font-ui);
    color: var(--muted);
  }
  .modes button[aria-selected='true'] {
    background: var(--gold);
    color: #1a1206;
  }
  form {
    display: grid;
    gap: 8px;
  }
  form label {
    display: grid;
    gap: 4px;
    font: 600 12px/1 var(--font-ui);
    color: var(--muted);
  }
  form input {
    padding: 9px 10px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: rgb(0 0 0 / 0.3);
    color: var(--ink);
    font: 15px/1.2 var(--font-ui);
  }
  form .primary {
    min-height: 40px;
  }
  .error {
    margin: 0;
    font: 13px/1.3 var(--font-ui);
    color: #ffb4a6;
  }
  .note.bad {
    color: #ffb4a6;
  }
  .notice-line {
    margin: 0;
    padding: 8px 10px;
    border-radius: 8px;
    background: rgb(95 208 255 / 0.12);
    font: 13px/1.3 var(--font-ui);
    color: #bfe8ff;
  }
  .account .profile {
    margin-left: auto;
    padding: 7px 12px;
    border-radius: 8px;
    background: rgb(242 198 78 / 0.14);
    font: 600 13px/1 var(--font-ui);
    color: #f2d27a;
    text-decoration: none;
  }
</style>
