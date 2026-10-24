<script lang="ts">
  export interface Option {
    label: string;
    /** Shown smaller beside the label: what the move puts down. */
    sub?: string;
    /** Keyboard shortcut. */
    key: string;
    suggested?: boolean;
    disabled?: boolean;
    pick: () => void;
  }

  interface Props {
    options: Option[];
    /** One line under the buttons: the advice, the odds, the stakes. */
    hint: string;
  }

  let { options, hint }: Props = $props();
</script>

<div class="bar">
  <div class="choice" role="group" aria-label="Your move">
    {#each options as option (option.label)}
      <button
        type="button"
        class="act"
        class:suggested={option.suggested}
        disabled={option.disabled}
        onclick={option.pick}
      >
        {option.label}
        {#if option.sub}<small>{option.sub}</small>{/if}
        <kbd>{option.key}</kbd>
      </button>
    {/each}
  </div>
  <p class="hint">{hint}</p>
</div>

<style>
  .bar {
    display: grid;
    justify-items: center;
    gap: 6px;
    min-height: 58px;
    padding: 8px 12px calc(8px + env(safe-area-inset-bottom));
  }
  .choice {
    display: flex;
    gap: 8px;
    width: 100%;
    justify-content: center;
    max-width: 560px;
  }
  .act {
    flex: 1 1 0;
    font: 600 15px/1 var(--font-display);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    padding: 12px 14px;
    min-height: 48px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }
  .act small {
    font: 400 12px/1 var(--font-ui);
    color: var(--muted);
  }
  .act.suggested {
    border-color: var(--gold);
    box-shadow: 0 0 0 1px var(--gold);
  }
  .act:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  /* Fixed height, one line: a longer hint never moves the buttons. */
  .hint {
    margin: 0;
    max-width: 100%;
    height: 17px;
    font: 13px/17px var(--font-ui);
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  kbd {
    font: 600 10px/1 var(--font-ui);
    padding: 2px 4px;
    border: 1px solid var(--line);
    border-bottom-width: 2px;
    border-radius: 4px;
    color: var(--muted);
  }
  @media (pointer: coarse) {
    kbd {
      display: none;
    }
  }
  /* Short landscape puts the action bar in a narrow side column: stack the choices. */
  @media (orientation: landscape) and (max-height: 520px) {
    .choice {
      flex-direction: column;
    }
    .act {
      flex: 0 0 auto;
    }
    .hint {
      height: auto;
      white-space: normal;
      text-align: center;
    }
  }
</style>
