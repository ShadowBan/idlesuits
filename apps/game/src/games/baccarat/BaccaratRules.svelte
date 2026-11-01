<script lang="ts">
  import { BACCARAT_BONUSES as BONUSES, type BaccaratRules } from '@idlesuits/sim';
  import RulesFrame from '../../components/RulesFrame.svelte';
  import { formatEdge } from '../../lib/sidebets.svelte';

  let { rules }: { rules: BaccaratRules } = $props();
  let frame: RulesFrame;

  export function open() {
    frame.open();
  }

  const banker = $derived(+(100 * (1 - rules.commission)).toFixed(2));
</script>

<RulesFrame
  bind:this={frame}
  steps={[
    { title: 'Back a hand', demo: 'Banker', text: 'Bet on the Player or the Banker. Neither is you; nobody decides anything.' },
    { title: 'Two cards each', demo: '9', text: 'Tens and faces count 0, aces 1. Only the last digit counts: 7 + 8 is 5.' },
    { title: 'Closest to 9', demo: '8 v 6', text: 'A third card may come by fixed rules. Nearest to nine wins.' },
  ]}
>
  {#snippet goal()}
    Back the hand that finishes <b>closest to nine</b>.
  {/snippet}

  <details>
    <summary>How bets are paid</summary>
    <ul>
      <li><b>Player</b> pays 1:1. <b>Banker</b> pays 1:1 less {+(rules.commission * 100).toFixed(2)}% commission ({banker}¢ on the dollar), because it wins a little more often.</li>
      <li>On a tie, Player and Banker bets push.</li>
      <li>House edge: Banker 1.06%, Player 1.24%. Banker is the best bet on the table.</li>
    </ul>
  </details>

  <details>
    <summary>When a third card comes</summary>
    <ul>
      <li>Either hand makes 8 or 9 on two cards (a natural): both stand.</li>
      <li>The Player draws on 0–5 and stands on 6 or 7.</li>
      <li>If the Player stood, the Banker draws on 0–5 too.</li>
      <li>
        If the Player drew, the Banker draws on 0–2; on 3 unless the Player's third card was an 8; on 4 against a 2–7;
        on 5 against a 4–7; on 6 against a 6 or 7; and stands on 7.
      </li>
    </ul>
  </details>

  <details>
    <summary>Side bets</summary>
    <ul>
      {#each BONUSES as bet (bet.id)}
        <li><b>{bet.name}</b>: {bet.blurb.charAt(0).toLowerCase() + bet.blurb.slice(1)} Pays {bet.rows[0]!.pays}:1. House edge {formatEdge(bet.edge)}.</li>
      {/each}
    </ul>
  </details>

  <details>
    <summary>Playing here</summary>
    <ul>
      <li>Tap the Player or Banker spot to move your bet there. <kbd>Space</kbd> deals.</li>
      <li>A {rules.decks}-deck shoe, dealt to a cut card. The scoreboard in the Stats tab shows this shoe's coups.</li>
      <li><b>Auto</b> deals coup after coup on the bets you've set.</li>
    </ul>
  </details>
</RulesFrame>
