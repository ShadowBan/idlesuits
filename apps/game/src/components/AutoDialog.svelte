<script lang="ts">
  import type { Snippet } from 'svelte';
  import { autoplay, type AutoSettings } from '../lib/autoplay.svelte';
  import { findGame } from '../lib/games';
  import { route } from '../lib/route.svelte';
  import { SPEEDS, type SpeedControl } from '../lib/sequencer.svelte';
  import { ui } from '../lib/ui.svelte';

  interface Props {
    seq: SpeedControl;
    autoPlay: boolean;
    onAuto: (on: boolean) => void;
    /** This game's own auto play settings (a raise plan, where to reel in). */
    automation?: Snippet;
  }

  let { seq, autoPlay, onAuto, automation }: Props = $props();

  let dialog = $state<HTMLDialogElement>();
  const name = $derived(findGame(route.current)?.name ?? 'This game');
  const s = $derived(autoplay.settings);

  // Opened from the table's auto controls, through `ui.autoOpen`.
  $effect(() => {
    if (!dialog) return;
    if (ui.autoOpen && !dialog.open) dialog.showModal();
    if (!ui.autoOpen && dialog.open) dialog.close();
  });

  /** A number typed into a rule, kept within its range; anything else leaves it as it was. */
  function num<K extends keyof AutoSettings>(key: K, min: number, max: number) {
    return (e: Event) => {
      const input = e.currentTarget as HTMLInputElement;
      const v = Number(input.value);
      if (Number.isFinite(v)) autoplay.set(key, Math.min(max, Math.max(min, v)) as AutoSettings[K]);
      input.value = String(autoplay.settings[key]);
    };
  }
  function amount<K extends 'stopBelowAmount' | 'stopAboveAmount'>(key: K) {
    return (e: Event) => {
      const input = e.currentTarget as HTMLInputElement;
      const v = Number(input.value.replace(/[$,\s]/g, ''));
      if (Number.isFinite(v) && v >= 0) autoplay.set(key, String(v));
      input.value = autoplay.settings[key];
    };
  }
</script>

<dialog bind:this={dialog} class="auto" aria-labelledby="auto-title" onclose={() => (ui.autoOpen = false)} onclick={(e) => e.target === dialog && dialog?.close()}>
  <div class="body">
    <header>
      <h2 id="auto-title">Auto play <span>{name}</span></h2>
      <button type="button" class="close" onclick={() => dialog?.close()} aria-label="Close">✕</button>
    </header>

    <button type="button" class="master" role="switch" aria-checked={autoPlay} onclick={() => onAuto(!autoPlay)}>
      <i aria-hidden="true"></i>
      <span>Auto play is <b>{autoPlay ? 'on' : 'off'}</b></span>
      <small>{autoPlay && autoplay.rounds ? `${autoplay.rounds} rounds so far` : 'stops if you bust'}</small>
    </button>

    <section>
      <h3>Speed</h3>
      <div class="speed" role="group" aria-label="Deal speed">
        {#each SPEEDS as sp (sp)}
          <button type="button" aria-pressed={seq.speed === sp} onclick={() => (seq.speed = sp)}>{sp === 'smart' ? 'Smart' : sp}</button>
        {/each}
      </div>
    </section>

    <section>
      <h3>Big wins</h3>
      <label class="rule">
        <input type="checkbox" checked={s.holdBig} onchange={(e) => autoplay.set('holdBig', e.currentTarget.checked)} />
        <span>
          Hold a win of
          <input class="n" type="number" min="1" max="100000" step="1" value={s.holdX} onchange={num('holdX', 1, 100000)} aria-label="Big win, in bets" />×
          the bet or more for
          <input class="n" type="number" min="1" max="60" step="1" value={s.holdSeconds} onchange={num('holdSeconds', 1, 60)} aria-label="Seconds" />
          seconds
        </span>
      </label>
    </section>

    <section>
      <h3>Stop when</h3>
      <label class="rule">
        <input type="checkbox" checked={s.stopOnWin} onchange={(e) => autoplay.set('stopOnWin', e.currentTarget.checked)} />
        <span>
          A win of
          <input class="n" type="number" min="1" max="1000000" step="1" value={s.stopWinX} onchange={num('stopWinX', 1, 1e6)} aria-label="Stop on a win of, in bets" />×
          the bet or more
        </span>
      </label>
      <label class="rule">
        <input type="checkbox" checked={s.stopAfter} onchange={(e) => autoplay.set('stopAfter', e.currentTarget.checked)} />
        <span>
          After
          <input class="n" type="number" min="1" max="100000" step="1" value={s.stopRounds} onchange={num('stopRounds', 1, 100000)} aria-label="Rounds" />
          rounds
        </span>
      </label>
      <label class="rule">
        <input type="checkbox" checked={s.stopBelow} onchange={(e) => autoplay.set('stopBelow', e.currentTarget.checked)} />
        <span>
          The bank falls below $<input class="m" type="text" inputmode="decimal" value={s.stopBelowAmount} onchange={amount('stopBelowAmount')} aria-label="Bank floor" />
        </span>
      </label>
      <label class="rule">
        <input type="checkbox" checked={s.stopAbove} onchange={(e) => autoplay.set('stopAbove', e.currentTarget.checked)} />
        <span>
          The bank reaches $<input class="m" type="text" inputmode="decimal" value={s.stopAboveAmount} onchange={amount('stopAboveAmount')} aria-label="Bank target" />
        </span>
      </label>
      <p class="note">These apply at every game. Wins count in bets: a $5 bet winning $50 is a 10× win.</p>
    </section>

    {#if automation}
      <section class="game">
        <h3>{name}</h3>
        <div class="own">{@render automation()}</div>
      </section>
    {/if}

    <div class="foot">
      <button type="button" class="reset" onclick={() => autoplay.reset()}>Reset rules</button>
      <button type="button" class="primary" onclick={() => dialog?.close()}>Done</button>
    </div>
  </div>
</dialog>

<style>
  dialog {
    width: min(480px, calc(100vw - 24px));
    max-height: calc(100dvh - 24px);
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--rail);
    color: var(--ink);
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.6);
  }
  .body {
    display: grid;
    gap: 16px;
    padding: 18px;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  h2 {
    margin: 0;
    font: 700 22px/1 var(--font-display);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--gold);
  }
  h2 span {
    display: block;
    margin-top: 4px;
    font: 500 12px/1 var(--font-ui);
    letter-spacing: 0.08em;
    color: var(--muted);
  }
  .close {
    min-height: 0;
    padding: 6px 10px;
  }
  h3 {
    margin: 0 0 8px;
    font: 600 11px/1 var(--font-ui);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
  }
  section {
    display: grid;
  }

  /* The master switch: big and plain. */
  .master {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border-radius: 12px;
    text-align: left;
    font: 15px/1.2 var(--font-ui);
  }
  .master i {
    position: relative;
    width: 44px;
    height: 26px;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.15);
    transition: background 150ms;
  }
  .master i::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #fff;
    transition: translate 150ms;
  }
  .master[aria-checked='true'] i {
    background: #2fa35a;
  }
  .master[aria-checked='true'] i::after {
    translate: 18px 0;
  }
  .master small {
    color: var(--muted);
    font-size: 12px;
  }

  .speed {
    display: flex;
    border: 1px solid var(--line);
    border-radius: 10px;
    overflow: hidden;
  }
  .speed button {
    flex: 1;
    min-height: 38px;
    border: 0;
    border-radius: 0;
    background: none;
  }
  .speed button[aria-pressed='true'] {
    background: var(--gold);
    color: #1a1206;
  }

  .rule {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: baseline;
    gap: 10px;
    padding: 6px 0;
    font: 14px/2 var(--font-ui);
  }
  .rule input[type='checkbox'] {
    width: 18px;
    height: 18px;
    accent-color: var(--gold);
    translate: 0 3px;
  }
  .rule input.n,
  .rule input.m {
    width: 74px;
    margin: 0 4px;
    padding: 3px 6px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: rgb(0 0 0 / 0.3);
    color: var(--ink);
    font: 600 14px/1.4 var(--font-ui);
    font-variant-numeric: tabular-nums;
  }
  .rule input.m {
    width: 110px;
    margin-left: 1px;
  }
  .note {
    margin: 4px 0 0;
    font: 12px/1.4 var(--font-ui);
    color: var(--muted);
  }
  .game .own {
    display: grid;
    gap: 10px;
  }
  .foot {
    display: flex;
    justify-content: space-between;
    gap: 10px;
  }
  .reset {
    min-height: 0;
  }
  .primary {
    min-width: 120px;
  }
</style>
