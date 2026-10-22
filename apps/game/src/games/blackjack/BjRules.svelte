<script lang="ts">
  import { BJ_BONUSES, type BjRules } from '@idlesuits/sim';
  import { formatEdge } from '../../lib/sidebets.svelte';

  let { rules }: { rules: BjRules } = $props();

  let dialog: HTMLDialogElement;

  export function open() {
    dialog.showModal();
  }

  const totals = $derived(rules.freeDoubleTotals.join(', ').replace(/, (\d+)$/, ' or $1'));
</script>

<dialog bind:this={dialog} aria-labelledby="bj-rules-title" onclick={(e) => e.target === dialog && dialog.close()}>
  <div class="body">
    <header>
      <h2 id="bj-rules-title">How to play</h2>
      <button type="button" class="close" onclick={() => dialog.close()} aria-label="Close">✕</button>
    </header>

    <p class="goal">Beat the dealer's total without going over <b>21</b>.</p>

    <ol class="steps">
      <li>
        <span class="num">1</span>
        <b>Draw</b>
        <span class="demo">10 + 7 = <i>17</i></span>
        <span>Hit for another card, or stand.</span>
      </li>
      <li>
        <span class="num">2</span>
        <b>Play free</b>
        <span class="demo gold">FREE</span>
        <span>The house pays for your doubles and splits.</span>
      </li>
      <li>
        <span class="num">3</span>
        <b>Dealer draws</b>
        <span class="demo">22 = <i>push</i></span>
        <span>Dealer 22 is a push, not a bust.</span>
      </li>
    </ol>

    <div class="free">
      <h3>What "free" means</h3>
      <p>
        On a hard {totals} the house puts up a second bet beside yours. On any pair but tens, it stakes your split hand
        for you. <b>Win and you are paid on that money too. Lose and it costs you nothing.</b>
      </p>
    </div>

    <details>
      <summary>The trade: dealer 22</summary>
      <p>
        In exchange, a dealer total of exactly 22 pushes every hand you did not bust, instead of paying you. Your
        blackjack still pays {rules.blackjackPays === 1.5 ? '3 to 2' : `${rules.blackjackPays}:1`}.
      </p>
    </details>

    <details>
      <summary>Table rules</summary>
      <ul>
        <li>{rules.decks} decks, dealer {rules.hitsSoft17 ? 'hits' : 'stands on'} soft 17.</li>
        <li>Split up to {rules.maxHands} hands. Split aces take one card each.</li>
        <li>Ten-value pairs cannot be split. Doubling after a split is fine.</li>
        <li>No surrender, no insurance.</li>
      </ul>
    </details>

    <details>
      <summary>Side bets</summary>
      <ul>
        {#each BJ_BONUSES as bet (bet.id)}
          <li><b>{bet.name}</b>: {bet.blurb.charAt(0).toLowerCase() + bet.blurb.slice(1)} House edge {formatEdge(bet.edge)}.</li>
        {/each}
        <li>Both are optional and start off. With Push 22 up, the dealer always draws out, even if you bust.</li>
      </ul>
    </details>

    <details>
      <summary>Playing here</summary>
      <ul>
        <li><kbd>H</kbd> hit · <kbd>S</kbd> stand · <kbd>D</kbd> double · <kbd>P</kbd> split</li>
        <li><kbd>Space</kbd> takes the suggested move, or deals the next hand.</li>
        <li>
          The suggestion comes from a strategy solved for these rules. Hands riding on house money play differently,
          because they have nothing to lose.
        </li>
        <li><b>Auto</b> plays that strategy for you.</li>
      </ul>
    </details>

    <button type="button" class="primary" onclick={() => dialog.close()}>Got it</button>
  </div>
</dialog>

<style>
  dialog {
    width: min(560px, calc(100vw - 32px));
    max-height: calc(100dvh - 32px);
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--rail);
    color: var(--ink);
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.65);
  }
  .body {
    display: grid;
    gap: 14px;
    padding: 20px;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  h2 {
    margin: 0;
    font: 700 24px/1 var(--font-display);
    text-transform: uppercase;
    color: var(--gold);
  }
  .close {
    padding: 6px 10px;
  }
  .goal {
    margin: 0;
    font: 500 17px/1.4 var(--font-ui);
  }
  .goal b {
    color: var(--gold);
  }
  .steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }
  .steps li {
    display: grid;
    justify-items: center;
    align-content: start;
    gap: 8px;
    padding: 14px 10px;
    border-radius: 10px;
    background: var(--felt-deep);
    text-align: center;
    font: 13px/1.35 var(--font-ui);
    color: var(--muted);
  }
  .steps b {
    font: 600 15px/1 var(--font-display);
    text-transform: uppercase;
    color: var(--ink);
  }
  .num {
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--gold);
    color: var(--felt-deep);
    font: 700 12px/1 var(--font-ui);
  }
  .demo {
    font: 600 15px/1 var(--font-display);
    color: var(--ink);
  }
  .demo i {
    color: var(--gold);
    font-style: normal;
  }
  .demo.gold {
    color: var(--felt-deep);
    background: var(--gold);
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 12px;
    letter-spacing: 0.1em;
  }
  .free {
    padding: 12px;
    border-radius: 10px;
    border: 1px dashed var(--gold);
  }
  .free h3 {
    margin: 0 0 6px;
    font: 600 12px/1 var(--font-ui);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--gold);
  }
  .free p {
    margin: 0;
    font: 13px/1.5 var(--font-ui);
  }
  details {
    border-top: 1px solid var(--line);
    padding-top: 10px;
  }
  summary {
    cursor: pointer;
    font: 600 13px/1.2 var(--font-ui);
  }
  details p,
  details ul {
    margin: 8px 0 0;
    font: 13px/1.5 var(--font-ui);
    color: var(--muted);
  }
  details ul {
    padding-left: 20px;
    display: grid;
    gap: 4px;
  }
  kbd {
    font: 600 11px/1 var(--font-ui);
    padding: 2px 5px;
    border: 1px solid var(--line);
    border-bottom-width: 2px;
    border-radius: 4px;
    color: var(--ink);
  }
  .primary {
    justify-self: center;
  }
  @media (max-width: 480px) {
    .steps {
      grid-template-columns: minmax(0, 1fr);
    }
    .steps li {
      grid-template-columns: auto auto 1fr;
      justify-items: start;
      align-items: center;
      text-align: left;
    }
    .steps li > span:last-child {
      grid-column: 1 / -1;
    }
  }
</style>
