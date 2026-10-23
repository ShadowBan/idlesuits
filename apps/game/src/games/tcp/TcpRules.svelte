<script lang="ts">
  import { TCP_BONUSES as BONUSES, type TcpRules } from '@idlesuits/sim';
  import RulesFrame from '../../components/RulesFrame.svelte';
  import { formatEdge } from '../../lib/sidebets.svelte';

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
    <summary>Side bets</summary>
    <ul>
      {#each BONUSES as bet (bet.id)}
        <li><b>{bet.name}</b>: {bet.blurb.charAt(0).toLowerCase() + bet.blurb.slice(1)} House edge {formatEdge(bet.edge)}.</li>
      {/each}
      <li>Each is optional, starts off, and pays on the cards alone, even if you fold. Pay tables are in the side panel.</li>
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
