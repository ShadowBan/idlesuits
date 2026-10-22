<script lang="ts">
  import { CATEGORY_NAMES, type UthRules } from '@idlesuits/sim';
  import RulesFrame from '../../components/RulesFrame.svelte';

  let { rules }: { rules: UthRules } = $props();
  let frame: RulesFrame;

  export function open() {
    frame.open();
  }

  const [big, small] = $derived([Math.max(...rules.preflopRaises), Math.min(...rules.preflopRaises)]);
</script>

<RulesFrame
  bind:this={frame}
  steps={[
    { title: 'Bet early', demo: `${small}× or ${big}×`, text: 'Like your two cards? Bet big before anything is shown.' },
    { title: 'Or wait', demo: `${rules.flopRaise}× → ${rules.riverRaise}×`, text: 'Check, and the price drops as more cards come out.' },
    { title: 'Showdown', demo: 'Best 5 of 7', text: 'Your two cards plus the board, against the dealer.' },
  ]}
>
  {#snippet goal()}
    Make a better poker hand than the dealer. <b>The sooner you commit, the more you can bet.</b>
  {/snippet}

  <details>
    <summary>Your bets</summary>
    <ul>
      <li><b>Ante</b> and <b>Blind</b> go down together, the same size.</li>
      <li>
        <b>Play</b> is the one extra bet you make: {big}× before the flop, {rules.flopRaise}× after it, or
        {rules.riverRaise}× at the end. If you have not bet by the end, you can fold and lose the Ante and Blind.
      </li>
      <li><b>Trips</b> is optional and pays on your hand alone, even if you fold.</li>
    </ul>
  </details>

  <details>
    <summary>How bets are paid</summary>
    <ul>
      <li>
        The dealer must have a {CATEGORY_NAMES[rules.qualifies].toLowerCase()} or better to <b>open</b>. If not, your
        Ante comes back and everything else plays on.
      </li>
      <li>Beat the dealer: Ante and Play pay 1:1. Lose: they lose. Tie: everything pushes.</li>
      <li>The Blind only pays on a winning straight or better (see the pay table). A smaller winning hand pushes it.</li>
    </ul>
  </details>

  <details>
    <summary>Playing here</summary>
    <ul>
      <li><kbd>C</kbd> check · <kbd>F</kbd> fold · <kbd>4</kbd> <kbd>3</kbd> <kbd>2</kbd> <kbd>1</kbd> bet that size</li>
      <li><kbd>Space</kbd> takes the suggested move, or deals.</li>
      <li>On the last decision the game counts every hand the dealer could hold and tells you how often you lose.</li>
      <li><b>Auto</b> plays the suggested strategy for you.</li>
    </ul>
  </details>
</RulesFrame>
