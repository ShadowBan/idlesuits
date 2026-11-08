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

  /**
   * Each move's colour, as a real table's buttons are: going on (hit, play,
   * raise) green, stopping (stand, fold) red, doubling gold, splitting blue,
   * anything else teal.
   */
  function tone(label: string): string {
    const l = label.toLowerCase();
    if (/double/.test(l)) return 'double';
    if (/split/.test(l)) return 'split';
    if (/^(stand|fold|stay|surrender|no )/.test(l)) return 'stop';
    if (/^(hit|play|bet|raise|call|draw|deal|turn|yes|take)/.test(l)) return 'go';
    return 'neutral';
  }
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
        class="act {tone(option.label)}"
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
    max-width: 760px;
  }
  /* A chunky casino button in its move's colour, lit from above, pressing down when tapped. */
  .act {
    --tone: #2f8f88;
    --tone-deep: #17514d;
    position: relative;
    flex: 1 1 0;
    min-width: 120px;
    height: 52px;
    min-height: 0;
    padding: 4px 8px;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 3px;
    white-space: nowrap;
    border: 0;
    border-radius: 12px;
    background:
      linear-gradient(rgb(255 255 255 / 0.22), rgb(255 255 255 / 0) 45%),
      linear-gradient(var(--tone), var(--tone-deep));
    color: #fff;
    text-shadow: 0 1px 0 rgb(0 0 0 / 0.45);
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 0.35),
      inset 0 0 0 1px rgb(0 0 0 / 0.25),
      0 4px 0 color-mix(in srgb, var(--tone-deep) 70%, #000),
      0 6px 12px rgb(0 0 0 / 0.4);
    transition:
      transform 90ms ease,
      box-shadow 90ms ease,
      filter 120ms ease;
  }
  /* Keeps its colour under the pointer: the app's plain button hover would grey it out. */
  .act:hover:not(:disabled) {
    background:
      linear-gradient(rgb(255 255 255 / 0.22), rgb(255 255 255 / 0) 45%),
      linear-gradient(var(--tone), var(--tone-deep));
    filter: brightness(1.12);
  }
  .act:active:not(:disabled) {
    transform: translateY(3px);
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 0.3),
      inset 0 0 0 1px rgb(0 0 0 / 0.25),
      0 1px 0 color-mix(in srgb, var(--tone-deep) 70%, #000),
      0 2px 6px rgb(0 0 0 / 0.4);
  }
  .act.go {
    --tone: #2fa35a;
    --tone-deep: #17603a;
  }
  .act.stop {
    --tone: #c8384a;
    --tone-deep: #7a1626;
  }
  .act.double {
    --tone: #e0a630;
    --tone-deep: #8a5a10;
  }
  .act.split {
    --tone: #3d7be0;
    --tone-deep: #1d3f8a;
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
    letter-spacing: 0.02em;
  }
  .act small {
    font: 500 11px/1 var(--font-ui);
    color: rgb(255 255 255 / 0.8);
  }
  /* The chart's move: ringed in gold, glowing gently. */
  .act.suggested {
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 0.35),
      0 0 0 2px var(--gold),
      0 4px 0 color-mix(in srgb, var(--tone-deep) 70%, #000),
      0 0 18px rgb(232 182 76 / 0.55);
    animation: suggest 1.4s ease-in-out infinite alternate;
  }
  @keyframes suggest {
    to {
      box-shadow:
        inset 0 1px 0 rgb(255 255 255 / 0.35),
        0 0 0 2px #ffe08a,
        0 4px 0 color-mix(in srgb, var(--tone-deep) 70%, #000),
        0 0 26px rgb(232 182 76 / 0.8);
    }
  }
  .act:disabled {
    opacity: 0.4;
    filter: saturate(0.3);
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
    border: 1px solid rgb(255 255 255 / 0.35);
    border-bottom-width: 2px;
    border-radius: 4px;
    color: rgb(255 255 255 / 0.75);
    text-shadow: none;
  }
  @media (pointer: coarse) {
    kbd {
      display: none;
    }
  }
  /* Phones: taller buttons for thumbs, filling the space the chip rack uses. Four or more go two by two, each still a good size. */
  @media (max-width: 899px) {
    .act {
      min-width: 0;
      height: 60px;
    }
    .choice.many {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }
    .many .act {
      height: 46px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .act.suggested {
      animation: none;
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
