<script lang="ts">
  import { TCP_BONUSES as BONUSES, type TcpRules } from '@idlesuits/sim';
  import RulesFrame from '../../components/RulesFrame.svelte';
  import { sideBetsGlance } from '../../lib/glance';

  let { rules }: { rules: TcpRules } = $props();
  let frame: RulesFrame;

  export function open() {
    frame.open();
  }
</script>

<RulesFrame
  bind:this={frame}
  steps={[
    { title: 'Three cards', demo: 'Ante', text: 'You and the dealer get three cards each.' },
    { title: 'Play or fold', demo: '1×', text: 'Like your hand? Match the ante to play. Fold and lose the ante.' },
    { title: 'Showdown', demo: 'Q-high', text: 'The dealer needs a queen high or better to qualify.' },
  ]}
  glance={[
    {
      heading: 'Your bets',
      items: [
        { name: 'Ante', tag: '1:1', text: 'Your bet to see three cards. Pays when you beat a qualifying dealer, or whenever the dealer does not qualify.' },
        { name: 'Play', tag: '1:1', text: 'Matches the Ante to stay in; folding gives up the Ante. Pays when you beat a qualifying dealer, and comes back if the dealer does not qualify.' },
        { name: 'Ante bonus', tag: `up to ${rules.anteBonus.straightFlush}:1`, text: 'Automatic: play a straight or better and the Ante pays extra, win or lose.' },
      ],
    },
    sideBetsGlance(BONUSES, 'Optional, off until you put a chip on one. Each pays on the cards alone, even if you fold.'),
  ]}
>
  {#snippet goal()}
    Beat the dealer's three cards. <b>A straight beats a flush</b> — with three cards it is the rarer hand.
  {/snippet}

  <details>
    <summary>How bets are paid</summary>
    <ul>
      <li>Dealer does not qualify: the Ante pays 1:1 and the Play bet comes back.</li>
      <li>Dealer qualifies: beat it and Ante and Play pay 1:1; lose and both lose; tie and both push.</li>
      <li>
        <b>Ante bonus</b>: play a straight or better and the Ante also pays {rules.anteBonus.straight}:1, three of a
        kind {rules.anteBonus.trips}:1, a straight flush {rules.anteBonus.straightFlush}:1 — even if the dealer wins.
      </li>
      <li>Hands rank: straight flush, three of a kind, straight, flush, pair, high card. A-2-3 is the lowest straight.</li>
    </ul>
  </details>


  <details>
    <summary>Playing here</summary>
    <ul>
      <li><kbd>P</kbd> play · <kbd>F</kbd> fold · <kbd>Space</kbd> takes the suggestion, or deals.</li>
      <li>The suggestion is the optimal strategy: play queen-6-4 or better, fold the rest.</li>
      <li><b>Auto</b> plays that strategy for you.</li>
    </ul>
  </details>
</RulesFrame>
