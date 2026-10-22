<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Step {
    title: string;
    /** A tiny picture of the step: cards, chips, a total. */
    demo: string;
    text: string;
  }

  interface Props {
    goal: Snippet;
    steps: Step[];
    /** Collapsible sections and anything else below the steps. */
    children: Snippet;
  }

  let { goal, steps, children }: Props = $props();
  let dialog: HTMLDialogElement;
  const id = `rules-${Math.random().toString(36).slice(2, 8)}`;

  export function open() {
    dialog.showModal();
  }
</script>

<dialog bind:this={dialog} aria-labelledby={id} onclick={(e) => e.target === dialog && dialog.close()}>
  <div class="body">
    <header>
      <h2 {id}>How to play</h2>
      <button type="button" class="close" onclick={() => dialog.close()} aria-label="Close">✕</button>
    </header>

    <p class="goal">{@render goal()}</p>

    <ol class="steps">
      {#each steps as step, i (step.title)}
        <li>
          <span class="num">{i + 1}</span>
          <b>{step.title}</b>
          <span class="demo">{step.demo}</span>
          <span>{step.text}</span>
        </li>
      {/each}
    </ol>

    {@render children()}

    <button type="button" class="primary" onclick={() => dialog.close()}>Got it</button>
  </div>
</dialog>

<style>
  dialog {
    width: min(580px, calc(100vw - 32px));
    max-height: calc(100dvh - 32px);
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--rail);
    color: var(--ink);
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.65);
  }
  .body {
    display: grid;
    gap: 14px;
    padding: 20px;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  h2 {
    margin: 0;
    font: 700 24px/1 var(--font-display);
    text-transform: uppercase;
    color: var(--gold);
  }
  .close {
    padding: 6px 10px;
  }
  .goal {
    margin: 0;
    font: 500 17px/1.4 var(--font-ui);
  }
  .goal :global(b) {
    color: var(--gold);
  }
  .steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }
  .steps li {
    display: grid;
    justify-items: center;
    align-content: start;
    gap: 8px;
    padding: 14px 10px;
    border-radius: 10px;
    background: var(--felt-deep);
    text-align: center;
    font: 13px/1.35 var(--font-ui);
    color: var(--muted);
  }
  .steps b {
    font: 600 15px/1 var(--font-display);
    text-transform: uppercase;
    color: var(--ink);
  }
  .num {
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--gold);
    color: var(--felt-deep);
    font: 700 12px/1 var(--font-ui);
  }
  .demo {
    font: 600 15px/1 var(--font-display);
    color: var(--ink);
    white-space: nowrap;
  }
  .body :global(details) {
    border-top: 1px solid var(--line);
    padding-top: 10px;
  }
  .body :global(summary) {
    cursor: pointer;
    font: 600 13px/1.2 var(--font-ui);
  }
  .body :global(details p),
  .body :global(details ul) {
    margin: 8px 0 0;
    font: 13px/1.5 var(--font-ui);
    color: var(--muted);
  }
  .body :global(details ul) {
    padding-left: 20px;
    display: grid;
    gap: 4px;
  }
  .body :global(kbd) {
    font: 600 11px/1 var(--font-ui);
    padding: 2px 5px;
    border: 1px solid var(--line);
    border-bottom-width: 2px;
    border-radius: 4px;
    color: var(--ink);
  }
  .primary {
    justify-self: center;
  }
  @media (max-width: 480px) {
    .steps {
      grid-template-columns: minmax(0, 1fr);
    }
    .steps li {
      grid-template-columns: auto auto 1fr;
      justify-items: start;
      align-items: center;
      text-align: left;
    }
    .steps li > span:last-child {
      grid-column: 1 / -1;
    }
  }
</style>
