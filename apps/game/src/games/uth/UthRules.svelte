<script lang="ts">
  import { CATEGORY_NAMES, UTH_BONUSES as BONUSES, type UthRules } from '@idlesuits/sim';
  import RulesFrame from '../../components/RulesFrame.svelte';
  import { sideBetsGlance } from '../../lib/glance';

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
  glance={[
    {
      heading: 'Your bets',
      items: [
        { name: 'Ante + Blind', tag: 'required', text: 'Two equal bets to start. The Ante pays 1:1 when you win (it comes back if the dealer does not open); the Blind pays extra on a winning straight or better and pushes on smaller wins.' },
        { name: 'Play', tag: '1:1', text: `Your one raise, made once: ${big}× or ${small}× before the flop, ${rules.flopRaise}× after it, ${rules.riverRaise}× at the end. Not raised by the end? Fold, and the Ante and Blind are lost.` },
      ],
    },
    sideBetsGlance(BONUSES, 'Optional, off until you put a chip on one. Each pays on the cards alone, even if you fold.'),
  ]}
>
  {#snippet goal()}
    Make a better poker hand than the dealer. <b>The sooner you commit, the more you can bet.</b>
  {/snippet}


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
