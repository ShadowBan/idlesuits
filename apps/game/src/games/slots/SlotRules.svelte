<script lang="ts">
  import type { MachineDef, SlotPayback } from '@idlesuits/sim';
  import RulesFrame from '../../components/RulesFrame.svelte';

  let { machine, payback }: { machine: MachineDef; payback: SlotPayback } = $props();
  let frame: RulesFrame;

  export function open() {
    frame.open();
  }
</script>

<RulesFrame
  bind:this={frame}
  steps={[
    { title: 'Spin', demo: '5 × 3', text: 'Five reels stop on three rows each. Pick your bet, then spin.' },
    { title: '243 ways', demo: 'A A A', text: 'Three or more of a symbol on reels side by side from the left pay, in any row.' },
    { title: 'Six coins', demo: '●●●●●●', text: 'Six gold coins anywhere start hold & spin. Fill all fifteen for the Grand.' },
  ]}
>
  {#snippet goal()}
    Line up symbols from the left reel, and land <b>six coins</b> to crack the vault.
  {/snippet}

  <details>
    <summary>How the ways pay</summary>
    <ul>
      <li>A symbol pays when it lands on reel 1 and on each reel after it, three reels or more, in any row.</li>
      <li>Every way through counts: two aces on each of three reels is 2 × 2 × 2 = 8 ways, each paid.</li>
      <li>The <b>Wild</b> lands on reels 2, 3 and 4 and stands in for every symbol but the coin. It pays nothing of its own.</li>
    </ul>
  </details>

  <details>
    <summary>Hold & spin</summary>
    <ul>
      <li>{machine.holdSpin.trigger} or more <b>gold coins</b> anywhere start it. Coins only pay in the feature.</li>
      <li>The coins stay put and every other cell respins. You start with {machine.holdSpin.respins} respins.</li>
      <li>Every coin that lands sticks and sets the respins back to {machine.holdSpin.respins}. It ends when they run out.</li>
      <li>Each coin pays the cash on it, or a jackpot: <b>Mini</b> ({machine.jackpots.mini}× bet), <b>Minor</b> ({machine.jackpots.minor}× bet) or <b>Major</b>.</li>
      <li>Fill all {machine.reels.length * machine.rows} cells and the <b>Grand</b> pays on top of every coin.</li>
    </ul>
  </details>

  <details>
    <summary>The progressives</summary>
    <ul>
      <li>The Major and the Grand are linked across every machine on the slot floor, and grow with every hand played anywhere in the casino: table or machine.</li>
      <li>They're counted in bets, so they pay the same share in every room. Hit one and it starts over for everyone.</li>
    </ul>
  </details>

  <details>
    <summary>The odds</summary>
    <ul>
      <li>Pays back {(payback.total * 100).toFixed(1)}% with the progressives at their starting amounts, more as they grow. Worked out exactly from the reel strips, not by simulation.</li>
      <li>Hold & spin starts about once in {Math.round(1 / payback.triggerRate)} spins, ends with {payback.featureCoins.toFixed(1)} coins on average, and fills the screen about once in {Math.round(1 / payback.fullRate).toLocaleString('en-US')} features.</li>
    </ul>
  </details>
</RulesFrame>
