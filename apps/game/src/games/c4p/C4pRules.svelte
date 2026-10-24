<script lang="ts">
  import { C4P_BONUSES as BONUSES, type C4pRules } from '@idlesuits/sim';
  import RulesFrame from '../../components/RulesFrame.svelte';
  import { formatEdge } from '../../lib/sidebets.svelte';

  let { rules }: { rules: C4pRules } = $props();
  let frame: RulesFrame;

  export function open() {
    frame.open();
  }
</script>

<RulesFrame
  bind:this={frame}
  steps={[
    { title: 'Five cards', demo: 'Ante + Super', text: 'Your best four cards play; the fifth is thrown away.' },
    { title: 'Play or fold', demo: `1× or ${rules.bigPlay}×`, text: `Play 1×, or up to ${rules.bigPlay}× with a pair of aces or better.` },
    { title: 'Showdown', demo: 'K-high', text: 'Best four against the dealer’s best four.' },
  ]}
>
  {#snippet goal()}
    Beat the dealer's best four cards. <b>With four cards, three of a kind beats a flush or straight.</b>
  {/snippet}

  <details>
    <summary>How bets are paid</summary>
    <ul>
      <li>
        <b>Ante</b>: needs the dealer to open with king high or better. Win and it pays 1:1; lose and it loses; if the dealer
        does not open, it pushes.
      </li>
      <li><b>Play</b>: pays 1:1 when you win or the dealer does not open; loses when the dealer wins.</li>
      <li>
        <b>Super Bonus</b>: a required bet the size of the Ante. A straight or better pays by the table, win or lose; below
        that it only loses when the dealer opens and beats you.
      </li>
      <li>Folding gives up the Ante and the Super Bonus.</li>
      <li>Hands rank: four of a kind, straight flush, three of a kind, flush, straight, two pair, pair, high card.</li>
    </ul>
  </details>

  <details>
    <summary>Side bets</summary>
    <ul>
      {#each BONUSES as bet (bet.id)}
        <li><b>{bet.name}</b>: {bet.blurb.charAt(0).toLowerCase() + bet.blurb.slice(1)} House edge {formatEdge(bet.edge)}.</li>
      {/each}
      <li>It is optional, starts off, and pays even if you fold.</li>
    </ul>
  </details>

  <details>
    <summary>Playing here</summary>
    <ul>
      <li><kbd>F</kbd> fold · <kbd>1</kbd> play 1× · <kbd>3</kbd> play 3× · <kbd>Space</kbd> takes the suggestion, or deals.</li>
      <li>The suggestion is within 0.0001% of perfect: play 3× with aces or better, 1× with K-Q-8-4 or better.</li>
      <li><b>Auto</b> plays that strategy for you.</li>
    </ul>
  </details>
</RulesFrame>
