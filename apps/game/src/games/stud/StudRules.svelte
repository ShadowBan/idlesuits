<script lang="ts">
  import RulesFrame from '../../components/RulesFrame.svelte';

  let frame: RulesFrame;

  export function open() {
    frame.open();
  }
</script>

<RulesFrame
  bind:this={frame}
  steps={[
    { title: 'Two cards', demo: 'Ante + 2', text: 'Look at your two cards, then bet 1× or 3×, or fold.' },
    { title: 'Raise as it builds', demo: '1× or 3×', text: 'Each community card brings another bet, or a fold.' },
    { title: 'Get paid', demo: 'Jacks → 1:1', text: 'Your five cards against the pay table, on every bet.' },
  ]}
>
  {#snippet goal()}
    Build a five-card poker hand. <b>There is no dealer to beat</b> — only the pay table.
  {/snippet}

  <details>
    <summary>How it is paid</summary>
    <ul>
      <li>Your two cards plus three community cards make the final hand.</li>
      <li>
        The same odds pay the Ante <b>and every street bet</b>. A pair of jacks or better pays 1:1, up to 500:1 for a
        royal flush.
      </li>
      <li>A pair of sixes through tens pushes: every bet comes back. Anything less loses them all.</li>
      <li>Folding gives up the Ante and whatever you have bet so far.</li>
    </ul>
  </details>

  <details>
    <summary>Playing here</summary>
    <ul>
      <li><kbd>F</kbd> fold · <kbd>1</kbd> bet 1× · <kbd>3</kbd> bet 3×</li>
      <li><kbd>Space</kbd> takes the suggested move, or deals.</li>
      <li>
        The suggestion is the published optimal strategy: count jacks to aces as 2 points and sixes to tens as 1, and
        raise harder on pairs and draws.
      </li>
      <li><b>Auto</b> plays that strategy for you.</li>
    </ul>
  </details>
</RulesFrame>
