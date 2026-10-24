<script lang="ts">
  import { DJ_BONUSES as BONUSES, type DjRules } from '@idlesuits/sim';
  import RulesFrame from '../../components/RulesFrame.svelte';
  import { formatEdge } from '../../lib/sidebets.svelte';

  let { rules }: { rules: DjRules } = $props();
  let frame: RulesFrame;

  export function open() {
    frame.open();
  }
</script>

<RulesFrame
  bind:this={frame}
  steps={[
    { title: 'Five cards', demo: 'Ante + Blind', text: 'Five cards each from 53. Every deuce and the joker are wild.' },
    { title: 'Play or fold', demo: `${rules.play}×`, text: 'Play twice the ante, or fold the Ante and Blind.' },
    { title: 'Showdown', demo: 'Best hand', text: 'Higher hand wins. The dealer never needs to qualify.' },
  ]}
>
  {#snippet goal()}
    Beat the dealer's five cards. <b>With five wild cards in the deck, big hands come often.</b>
  {/snippet}

  <details>
    <summary>How bets are paid</summary>
    <ul>
      <li>Win: the Ante and Play pay 1:1, and the Blind by its table — straights and better only; smaller wins push it.</li>
      <li>Lose: the Ante, Blind and Play all lose. A tie pushes everything.</li>
      <li>Hands rank: five wilds, royal flush, five of a kind, straight flush, four of a kind, full house, flush, straight, three of a kind, two pair, pair.</li>
    </ul>
  </details>

  <details>
    <summary>Side bets</summary>
    <ul>
      {#each BONUSES as bet (bet.id)}
        <li><b>{bet.name}</b>: {bet.blurb.charAt(0).toLowerCase() + bet.blurb.slice(1)} House edge {formatEdge(bet.edge)}.</li>
      {/each}
      <li>For Trips, a deuce that plays as itself, as in A-2-3-4-5, still counts as natural.</li>
      <li>Both are optional and start off. Trips pays even if you fold; folding forfeits the Bad Beat.</li>
    </ul>
  </details>

  <details>
    <summary>Playing here</summary>
    <ul>
      <li><kbd>P</kbd> play · <kbd>F</kbd> fold · <kbd>Space</kbd> takes the suggestion, or deals.</li>
      <li>The suggestion is the published strategy: play a pair of fours or better, except two fours with a three.</li>
      <li><b>Auto</b> plays that strategy for you.</li>
    </ul>
  </details>
</RulesFrame>
