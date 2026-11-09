<script lang="ts">
  import { account } from '../lib/account.svelte';

  /** Why the save changed under the player, after a reload: shown a few seconds. */
  let toast = $state(account.notice);
  $effect(() => {
    if (!toast) return;
    const t = setTimeout(() => (toast = null), 5000);
    return () => clearTimeout(t);
  });

  const ago = (at: number) => {
    const m = Math.round((Date.now() - at) / 60_000);
    return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
  };
</script>

<!--
  The account was played on another device since this one last saved. Nothing
  is overwritten until the player picks which progress to keep.
-->
{#if toast && account.status !== 'conflict'}
  <div class="toast" role="status">{toast}</div>
{/if}

{#if account.status === 'conflict' && account.conflict}
  <div class="conflict" role="alertdialog" aria-labelledby="conflict-title" aria-describedby="conflict-text">
    <b id="conflict-title">Played on another device</b>
    <p id="conflict-text">
      Your account was saved on another device {ago(account.conflict.updatedAt)}, after this one last saved. Which progress do you want to keep?
    </p>
    <div class="choices">
      <button type="button" class="primary" onclick={() => account.useCloud()}>Load the other device’s</button>
      <button type="button" onclick={() => account.keepThis()}>Keep this one’s</button>
    </div>
  </div>
{/if}

<style>
  .conflict {
    position: fixed;
    z-index: 1000;
    top: 12px;
    left: 50%;
    translate: -50% 0;
    display: grid;
    gap: 8px;
    width: min(480px, calc(100vw - 24px));
    padding: 14px 16px;
    border-radius: 14px;
    background: #10202e;
    box-shadow:
      inset 0 0 0 1.5px #5fd0ff,
      0 12px 40px rgb(0 0 0 / 0.6);
    color: var(--ink);
  }
  .toast {
    position: fixed;
    z-index: 1000;
    top: 12px;
    left: 50%;
    translate: -50% 0;
    padding: 10px 16px;
    border-radius: 999px;
    background: #10202e;
    box-shadow:
      inset 0 0 0 1px rgb(95 208 255 / 0.7),
      0 8px 24px rgb(0 0 0 / 0.5);
    font: 600 13px/1.2 var(--font-ui);
    color: #bfe8ff;
    animation: toast 5s ease forwards;
    pointer-events: none;
  }
  @keyframes toast {
    0% {
      opacity: 0;
      translate: -50% -8px;
    }
    6%,
    85% {
      opacity: 1;
      translate: -50% 0;
    }
    100% {
      opacity: 0;
    }
  }
  b {
    font: 700 16px/1.2 var(--font-display);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #8fe3ff;
  }
  p {
    margin: 0;
    font: 14px/1.4 var(--font-ui);
    color: #d6e6f2;
  }
  .choices {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .choices button {
    flex: 1;
    min-height: 40px;
    font: 600 14px/1.2 var(--font-ui);
    letter-spacing: 0;
    text-transform: none;
  }
</style>
