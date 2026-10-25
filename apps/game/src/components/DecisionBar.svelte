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

<!--
  Every button is the same fixed size, label over sub-line, and the hint is one
  fixed line: whatever the choices say, the bar keeps its height.
-->
<div class="bar">
  <div class="choice" class:many={options.length >= 4} role="group" aria-label="Your move">
    {#each options as option (option.label)}
      <button
        type="button"
        class="act"
        class:suggested={option.suggested}
        disabled={option.disabled}
        onclick={option.pick}
      >
        <span class="label">{option.label}</span>
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
    position: relative;
    flex: 1 1 0;
    min-width: 0;
    height: 52px;
    min-height: 0;
    padding: 4px 8px;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 3px;
    white-space: nowrap;
  }
  .label {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    font: 600 15px/1 var(--font-display);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .many .label {
    font-size: 13px;
    letter-spacing: 0.02em;
  }
  .act small {
    font: 400 11px/1 var(--font-ui);
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
  /* The key, tucked into the corner so it never takes room from the label. */
  kbd {
    position: absolute;
    top: 4px;
    right: 5px;
    font: 600 9px/1 var(--font-ui);
    padding: 1px 3px;
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
  /* Phones: taller buttons for thumbs, filling the space the chip rack uses. */
  @media (max-width: 899px) {
    .act {
      height: 60px;
    }
  }
  /* Short landscape puts the action bar in a narrow side column: stack the choices. */
  @media (orientation: landscape) and (max-height: 520px) {
    .choice {
      flex-direction: column;
    }
    .act {
      flex: 0 0 auto;
      height: 44px;
    }
    .hint {
      height: 34px;
      white-space: normal;
      text-align: center;
    }
  }
</style>
