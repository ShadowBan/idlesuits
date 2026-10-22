<script lang="ts">
  import { maxRaise, rankLabel, SUIT_SYMBOL, type Suit, type TableRules } from '@idlesuits/sim';

  let { rules }: { rules: TableRules } = $props();

  let dialog: HTMLDialogElement;

  export function open() {
    dialog.showModal();
  }

  // Built from the live rules so the text stays true when cards or dealers change them.
  const q = $derived(rules.qualifier);
  const raiseCaps = $derived([3, 4, 5, 6].map((size) => ({ size, cap: maxRaise(rules.raiseCaps, size) })));

  const mini = (spec: string) =>
    spec.split(' ').map((c) => ({ rank: c.slice(0, -1), suit: c.slice(-1) as Suit }));
  const exampleYou = mini('AH 7H 2H');
  const exampleDealer = mini('KS QS JS');
</script>

{#snippet cards(list: { rank: string; suit: Suit }[], dim = false)}
  <span class="mini-hand" class:dim>
    {#each list as c, i (i)}
      <span class="mini" class:red={c.suit === 'H' || c.suit === 'D'}>{c.rank}{SUIT_SYMBOL[c.suit]}</span>
    {/each}
  </span>
{/snippet}

<dialog bind:this={dialog} aria-labelledby="rules-title" onclick={(e) => e.target === dialog && dialog.close()}>
  <div class="body">
    <header>
      <h2 id="rules-title">How to play</h2>
      <button type="button" class="close" onclick={() => dialog.close()} aria-label="Close">✕</button>
    </header>

    <p class="goal">Get <b>more cards of one suit</b> than the dealer.</p>

    <ol class="steps">
      <li>
        <span class="num">1</span>
        <b>Flip</b>
        {@render cards(mini('9H 4C KH 2H 7S'))}
        <span>Turn over your {rules.handSize} cards.</span>
      </li>
      <li>
        <span class="num">2</span>
        <b>Bet</b>
        <span class="chips"><span class="chip">Fold</span><span class="chip gold">1×</span><span class="chip gold">2×</span><span class="chip gold">3×</span></span>
        <span>Fold, or raise more on bigger flushes.</span>
      </li>
      <li>
        <span class="num">3</span>
        <b>Beat the dealer</b>
        <span class="vs">♥ 4 <i>vs</i> ♠ 3</span>
        <span>The longer flush wins.</span>
      </li>
    </ol>

    <div class="example">
      <span class="tag">Tie on size?</span>
      {@render cards(exampleYou)}
      <span class="beats">beats</span>
      {@render cards(exampleDealer, true)}
      <span class="why">Highest card in the flush decides: {rankLabel(14)} beats {rankLabel(13)}.</span>
    </div>

    <details>
      <summary>Dealer must qualify</summary>
      <p>
        The dealer needs a {q.minSize}-card flush, {rankLabel(q.minHighCard)}-high or better. If not, your Ante wins and your raise
        comes back.
      </p>
    </details>

    <details>
      <summary>Raise limits &amp; payouts</summary>
      <div class="tables">
        <table>
          <caption>Raise up to</caption>
          <tbody>
            {#each raiseCaps as row (row.size)}
              <tr><td>{row.size}{row.size === 6 ? '+' : ''} cards</td><td>{row.cap}×</td></tr>
            {/each}
          </tbody>
        </table>
        {#each rules.sideBets as bet (bet.id)}
          <table>
            <caption>{bet.name}{bet.metric === 'straightFlush' ? ' (suited run)' : ''}</caption>
            <tbody>
              {#each Object.entries(bet.pays.values) as [n, pays] (n)}
                <tr><td>{n} {bet.metric === 'flushSize' ? 'suited' : 'in a row'}</td><td>{pays.toLocaleString('en-US')}:1</td></tr>
              {/each}
            </tbody>
          </table>
        {/each}
      </div>
      <p class="note">Win: Ante and raise pay 1:1. Side bets pay on your hand alone, even if you fold.</p>
    </details>

    <details>
      <summary>Controls</summary>
      <ul class="keys">
        <li><kbd>Space</kbd> flip / deal</li>
        <li><kbd>F</kbd> fold</li>
        <li><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> raise</li>
        <li><b>Auto</b> plays for you, using your raise plan</li>
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
    font: 600 16px/1 var(--font-display);
    text-transform: uppercase;
    letter-spacing: 0.04em;
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

  .mini-hand {
    display: inline-flex;
    gap: 3px;
  }
  .mini {
    display: inline-grid;
    place-items: center;
    width: 26px;
    height: 34px;
    border-radius: 4px;
    background: var(--card-face);
    color: var(--card-black);
    font: 700 11px/1 var(--font-display);
  }
  .mini.red {
    color: var(--card-red);
  }
  .mini-hand.dim .mini {
    filter: saturate(0.35) brightness(0.62);
  }
  .chips {
    display: inline-flex;
    gap: 3px;
    min-height: 34px;
    align-items: center;
  }
  .chip {
    padding: 4px 6px;
    border-radius: 999px;
    border: 1px solid var(--line);
    font: 600 11px/1 var(--font-ui);
    color: var(--ink);
  }
  .chip.gold {
    border-color: var(--gold);
    color: var(--gold);
  }
  .vs {
    min-height: 34px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font: 700 18px/1 var(--font-display);
    color: var(--ink);
  }
  .vs i {
    font: 400 12px/1 var(--font-ui);
    color: var(--muted);
  }

  .example {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 8px 10px;
    padding: 12px;
    border-radius: 10px;
    border: 1px dashed var(--line);
  }
  .tag {
    font: 600 11px/1 var(--font-ui);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
    flex-basis: 100%;
    text-align: center;
  }
  .beats {
    font: 600 13px/1 var(--font-ui);
    color: var(--win);
  }
  .why {
    flex-basis: 100%;
    text-align: center;
    font: 13px/1.4 var(--font-ui);
    color: var(--muted);
  }

  details {
    border-top: 1px solid var(--line);
    padding-top: 10px;
  }
  summary {
    cursor: pointer;
    font: 600 13px/1.2 var(--font-ui);
    color: var(--ink);
  }
  summary:focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: 2px;
  }
  details p,
  .note {
    margin: 8px 0 0;
    font: 13px/1.45 var(--font-ui);
    color: var(--muted);
  }
  .tables {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 24px;
    margin-top: 8px;
  }
  table {
    border-collapse: collapse;
    font: 12px/1.45 var(--font-ui);
  }
  caption {
    text-align: left;
    font-weight: 600;
    color: var(--ink);
    padding-bottom: 2px;
  }
  td {
    padding: 0 12px 0 0;
    color: var(--muted);
  }
  td:last-child {
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  .keys {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px 16px;
    font: 13px/1.6 var(--font-ui);
    color: var(--muted);
  }
  kbd {
    font: 600 11px/1 var(--font-ui);
    padding: 2px 5px;
    margin-right: 3px;
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
