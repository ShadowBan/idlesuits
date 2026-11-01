<script lang="ts">
  interface Props {
    /** Cards in the whole shoe. */
    size: number;
    /** The next card to deal: everything before it is in the discard tray. */
    next: number;
    /** Where the cut card sits. */
    cut: number;
    shuffling?: boolean;
  }

  let { size, next, cut, shuffling = false }: Props = $props();

  const left = $derived(Math.max(0, size - next));
  /** Fractions of the shoe, for drawing. */
  const fill = $derived(size ? left / size : 0);
  const cutAt = $derived(size ? Math.max(0, cut - next) / size : 0);
  const discards = $derived(size ? next / size : 0);
</script>

<!--
  The dealing shoe on the dealer's left and the discard tray on the right, as
  a casino deals blackjack and baccarat: you can see how deep the shoe is and
  when the cut card is close.
-->
<div class="rack" aria-label="{left} cards left in the shoe{shuffling ? ', shuffling' : ''}">
  <div class="tray" title="Discards: {next} cards">
    <span class="stack" style:--h={discards}></span>
    <span class="label">Discards</span>
  </div>
  <div class="shoe" class:shuffling title="{left} cards left; the cut card comes out after {Math.max(0, cut - next)} more">
    <span class="box">
      <span class="cards" style:--w={fill}></span>
      {#if cutAt > 0 && !shuffling}<span class="cut" style:--x={cutAt}></span>{/if}
    </span>
    <span class="label">{shuffling ? 'Shuffling' : `Shoe · ${left}`}</span>
  </div>
</div>

<style>
  .rack {
    position: absolute;
    inset: 6px 14px auto;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    pointer-events: none;
  }
  .tray,
  .shoe {
    display: grid;
    justify-items: center;
    gap: 3px;
  }
  .label {
    font: 600 9px/1 var(--font-ui);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--print);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  /* The discard tray: a clear box that fills up with card backs, edge on. */
  .tray {
    --tray-h: 30px;
  }
  .tray::before {
    content: '';
    grid-area: 1 / 1;
    width: 30px;
    height: var(--tray-h);
    border-radius: 3px;
    border: 1px solid rgb(236 216 160 / 0.3);
    background: rgb(0 0 0 / 0.25);
  }
  .stack {
    grid-area: 1 / 1;
    align-self: end;
    width: 24px;
    height: calc((var(--tray-h) - 4px) * var(--h));
    margin-bottom: 2px;
    border-radius: 1px;
    background: repeating-linear-gradient(#f2efe8 0 1px, #8f1d2c 1px 3px);
    transition: height 400ms ease;
  }
  /* The shoe: a dark box, cards edge on from the front, with the yellow cut card among them. */
  .box {
    position: relative;
    width: 64px;
    height: 24px;
    border-radius: 4px 10px 4px 4px;
    background: linear-gradient(#2a1a10, #120b07);
    box-shadow:
      inset 0 0 0 1px rgb(236 216 160 / 0.25),
      0 2px 4px rgb(0 0 0 / 0.5);
    overflow: hidden;
  }
  /* Filled from the front of the shoe, where cards come out. */
  .cards {
    position: absolute;
    top: 4px;
    bottom: 4px;
    right: 4px;
    width: calc((100% - 8px) * var(--w));
    background: repeating-linear-gradient(90deg, #f2efe8 0 1px, #8f1d2c 1px 3px);
    transition: width 400ms ease;
  }
  /* Measured from the front of the shoe, where the next card comes out. */
  .cut {
    position: absolute;
    top: 2px;
    bottom: 2px;
    right: calc(4px + (100% - 8px) * var(--x));
    width: 2px;
    margin-right: -1px;
    background: #f2d22e;
    box-shadow: 0 0 4px rgb(242 210 46 / 0.8);
  }
  .shuffling .box {
    animation: riffle 450ms ease-in-out infinite alternate;
  }
  .shuffling .label {
    color: var(--gold);
  }
  @keyframes riffle {
    to {
      transform: translateY(-2px) rotate(-2deg);
    }
  }
  @container (max-width: 520px) {
    .rack {
      inset: 4px 10px auto;
    }
    .box {
      width: 44px;
      height: 18px;
    }
    .tray {
      --tray-h: 22px;
    }
    .tray::before {
      width: 22px;
    }
    .stack {
      width: 17px;
    }
  }
</style>
