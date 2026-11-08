<script lang="ts">
  import { LIR_BONUSES as BONUSES, type LirRules } from '@idlesuits/sim';
  import RulesFrame from '../../components/RulesFrame.svelte';
  import { sideBetsGlance } from '../../lib/glance';

  let { rules }: { rules: LirRules } = $props();
  let frame: RulesFrame;

  export function open() {
    frame.open();
  }
</script>

<RulesFrame
  bind:this={frame}
  steps={[
    { title: 'Three bets', demo: '1 · 2 · $', text: 'Put down three equal bets and get three cards.' },
    { title: 'Pull back', demo: 'or ride', text: 'Before each community card, take back a bet — or let it ride.' },
    { title: 'Get paid', demo: '10s → 1:1', text: 'Your five cards pay every bet still up.' },
  ]}
  glance={[
    {
      heading: 'Your bets',
      items: [
        { name: 'Bets 1, 2 and $', tag: `up to ${rules.pays[9]}:1`, text: 'Three equal bets. Pull back bet 1 after your three cards and bet 2 after the first community card, or let them ride. The $ bet always rides. Every bet still up is paid by the pay table: tens or better win.' },
      ],
    },
    sideBetsGlance(BONUSES),
  ]}
>
  {#snippet goal()}
    Make a pair of tens or better. <b>There is no dealer to beat</b> — only the pay table.
  {/snippet}

  <details>
    <summary>How it is paid</summary>
    <ul>
      <li>Your three cards plus two community cards make your hand.</li>
      <li>Every bet still riding is paid at the same odds: tens or better 1:1, up to {rules.pays[9]}:1 for a royal flush.</li>
      <li>The third bet always rides; the first two can be pulled back, one after three cards and one after four.</li>
    </ul>
  </details>


  <details>
    <summary>Playing here</summary>
    <ul>
      <li><kbd>R</kbd> let it ride · <kbd>P</kbd> pull back · <kbd>Space</kbd> takes the suggestion, or deals.</li>
      <li>
        The suggestion is the published optimal strategy: ride with a paying hand, three to a royal, and good suited draws;
        with four cards, also four to a flush or an open-ended straight.
      </li>
      <li><b>Auto</b> plays that strategy for you.</li>
    </ul>
  </details>
</RulesFrame>
