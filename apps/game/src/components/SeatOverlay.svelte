<script lang="ts">
  import { formatMoney, type Decimal } from '../lib/money';

  interface Props {
    started: boolean;
    gameOver: boolean;
    /** One or two sentences on how the game goes. */
    intro: string;
    hands: number;
    biggestWin: Decimal;
    onSeat: () => void;
    onRules: () => void;
    onRestart: () => void;
  }

  let { started, gameOver, intro, hands, biggestWin, onSeat, onRules, onRestart }: Props = $props();
</script>

{#if !started}
  <div class="overlay">
    <p>{intro}</p>
    <button type="button" class="primary" onclick={onSeat}>Take a seat</button>
    <button type="button" onclick={onRules}>How to play</button>
  </div>
{:else if gameOver}
  <div class="overlay">
    <h2>Busted</h2>
    <p>{hands} hands · biggest win {formatMoney(biggestWin)}</p>
    <button type="button" class="primary" onclick={onRestart}>Buy back in</button>
  </div>
{/if}

<style>
  .overlay {
    position: absolute;
    inset: 0;
    z-index: 4;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 14px;
    padding: 16px;
    text-align: center;
    background: rgb(5 20 15 / 0.82);
  }
  h2 {
    margin: 0;
    font: 700 36px/1 var(--font-display);
    color: var(--loss);
    text-transform: uppercase;
  }
  p {
    margin: 0;
    max-width: 36ch;
    color: var(--muted);
  }
</style>
