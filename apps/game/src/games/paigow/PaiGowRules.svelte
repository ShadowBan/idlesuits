<script lang="ts">
  import { PG_BONUSES as BONUSES } from '@idlesuits/sim';
  import RulesFrame from '../../components/RulesFrame.svelte';
  import { formatEdge } from '../../lib/sidebets.svelte';

  let frame: RulesFrame;

  export function open() {
    frame.open();
  }
</script>

<RulesFrame
  bind:this={frame}
  steps={[
    { title: 'Seven cards', demo: '5 + 2', text: 'Split them into a five-card high hand and a two-card low hand.' },
    { title: 'High beats low', demo: 'High > low', text: 'Your high hand must outrank your low hand.' },
    { title: 'Two showdowns', demo: 'Win both', text: 'High against high, low against low. Win both to get paid.' },
  ]}
>
  {#snippet goal()}
    Beat the dealer with <b>both</b> hands. Win one and lose one, and your bet comes back.
  {/snippet}

  <details>
    <summary>How bets are paid</summary>
    <ul>
      <li>Win both hands: paid 1:1, less a 5% commission. Win one: push. Lose both: lose.</li>
      <li>Exact ties, called copies, go to the dealer.</li>
      <li>The dealer sets their hand by the <b>house way</b>, a fixed set of rules.</li>
    </ul>
  </details>

  <details>
    <summary>The cards</summary>
    <ul>
      <li>53 cards: a standard deck plus one <b>joker</b>.</li>
      <li>The joker plays as an ace, or fills a straight, flush or straight flush. It is not fully wild.</li>
      <li>Five aces is the best hand. A-2-3-4-5 is the second-best straight.</li>
      <li>The low hand is just a pair or two high cards; A-K is the best non-pair.</li>
    </ul>
  </details>

  <details>
    <summary>Side bets</summary>
    <ul>
      {#each BONUSES as bet (bet.id)}
        <li><b>{bet.name}</b>: {bet.blurb.charAt(0).toLowerCase() + bet.blurb.slice(1)} House edge {formatEdge(bet.edge)}.</li>
      {/each}
      <li>Each is optional and starts off. They pay on your seven cards, however you set them.</li>
    </ul>
  </details>

  <details>
    <summary>Playing here</summary>
    <ul>
      <li>Tap two cards to make your low hand, then <b>Set hand</b>. Keys <kbd>1</kbd>–<kbd>7</kbd> pick cards too.</li>
      <li><kbd>H</kbd> picks the house way for you to check; <kbd>Space</kbd> sets your pick, or the house way.</li>
      <li><b>Auto</b> sets every hand by the house way.</li>
    </ul>
  </details>
</RulesFrame>
