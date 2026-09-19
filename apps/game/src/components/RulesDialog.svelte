<script lang="ts">
  import { maxRaise, rankLabel, type TableRules } from '@idlesuits/sim';

  let { rules }: { rules: TableRules } = $props();

  let dialog: HTMLDialogElement;

  export function open() {
    dialog.showModal();
  }

  // Written from the live rules so the text stays true when cards or dealers change them.
  const q = $derived(rules.qualifier);
  const raiseRows = $derived(
    [2, 3, 4, 5, 6, 7].map((size) => ({ size, cap: maxRaise(rules.raiseCaps, size) })),
  );
  const payRows = (values: Record<number, number>) =>
    Object.entries(values).map(([n, pays]) => ({ n: Number(n), pays }));
</script>

<dialog bind:this={dialog} aria-labelledby="rules-title" onclick={(e) => e.target === dialog && dialog.close()}>
  <div class="body">
    <header>
      <h2 id="rules-title">How to play</h2>
      <button type="button" onclick={() => dialog.close()} aria-label="Close">✕</button>
    </header>

    <section>
      <h3>The goal</h3>
      <p>
        Beat the dealer's hand. You and the dealer each get {rules.handSize} cards. A hand is only as good as its
        <b>flush</b>: the most cards you hold in a single suit.
      </p>
    </section>

    <section>
      <h3>A hand, step by step</h3>
      <ol>
        <li>Place your <b>Ante</b>, and any <b>side bets</b> you want.</li>
        <li>You and the dealer are each dealt {rules.handSize} cards face down. Turn yours over.</li>
        <li>
          Decide: <b>Fold</b> (you lose the Ante) or <b>Raise</b>. The bigger your flush, the more you may raise.
        </li>
        <li>The dealer reveals, and the hands are compared.</li>
      </ol>
    </section>

    <section>
      <h3>Which hand wins</h3>
      <ul>
        <li>More cards in one suit beats fewer: a 4-card flush beats any 3-card flush.</li>
        <li>
          Same size? Compare the highest card <i>in each flush</i>, then the next highest, and so on. Cards outside the
          flush never count.
        </li>
        <li>Exactly the same flush is a <b>push</b>: your bets are returned.</li>
      </ul>
      <p class="example">Example: ♥ A-7-2 beats ♠ K-Q-J, because the Ace beats the King.</p>
    </section>

    <section>
      <h3>How much you may raise</h3>
      <table>
        <thead><tr><th>Your flush</th><th>Raise up to</th></tr></thead>
        <tbody>
          {#each raiseRows as row (row.size)}
            <tr><td>{row.size}-card</td><td>{row.cap}× Ante</td></tr>
          {/each}
        </tbody>
      </table>
    </section>

    <section>
      <h3>The dealer must qualify</h3>
      <p>
        The dealer needs at least a {q.minSize}-card flush, {rankLabel(q.minHighCard)}-high.
      </p>
      <ul>
        <li><b>Dealer doesn't qualify:</b> your Ante wins 1:1 and your raise is returned.</li>
        <li><b>Dealer qualifies:</b> if you win, Ante and raise both pay 1:1. If you lose, you lose both. A tie pushes.</li>
      </ul>
    </section>

    <section>
      <h3>Side bets</h3>
      <p>
        Side bets pay on <i>your</i> hand alone, win or lose against the dealer, even if you fold. Set a stake of $0 to
        skip one.
      </p>
      {#each rules.sideBets as bet (bet.id)}
        <table>
          <caption>{bet.name}: {bet.metric === 'flushSize' ? 'flush size' : 'longest straight flush (suited run)'}</caption>
          <tbody>
            {#each payRows(bet.pays.values) as row (row.n)}
              <tr><td>{row.n} cards</td><td>{row.pays}:1</td></tr>
            {/each}
          </tbody>
        </table>
      {/each}
    </section>

    <section>
      <h3>Playing here</h3>
      <ul>
        <li><b>Click your cards</b> to turn them over, or press <kbd>Space</kbd>. <b>Flip all</b> turns the rest.</li>
        <li>Choose your bet with the buttons, or <kbd>F</kbd> to fold and <kbd>1</kbd>–<kbd>3</kbd> to raise.</li>
        <li>The <b>Bets</b> panel sets your Ante, side bets and <b>raise plan</b>. The plan is a suggestion while you play, and what <b>Auto</b> follows.</li>
        <li><b>Auto</b> plays hands for you. Speed controls how fast. Smart slows down when something is at stake.</li>
        <li><b>Expected per hand</b> shows what your current bets are worth over thousands of hands.</li>
      </ul>
    </section>

    <button type="button" class="primary" onclick={() => dialog.close()}>Got it</button>
  </div>
</dialog>

<style>
  dialog {
    width: min(620px, calc(100vw - 32px));
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
    gap: 16px;
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
  h3 {
    margin: 0 0 6px;
    font: 600 12px/1 var(--font-ui);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
  }
  p,
  li {
    font: 14px/1.5 var(--font-ui);
    margin: 0;
  }
  ol,
  ul {
    margin: 0;
    padding-left: 20px;
    display: grid;
    gap: 4px;
  }
  .example {
    margin-top: 6px;
    color: var(--muted);
  }
  table {
    border-collapse: collapse;
    font: 13px/1.4 var(--font-ui);
    margin-top: 6px;
    min-width: 220px;
  }
  caption {
    text-align: left;
    font-weight: 600;
    padding-bottom: 2px;
  }
  th {
    text-align: left;
    color: var(--muted);
    font-weight: 500;
  }
  th,
  td {
    padding: 2px 16px 2px 0;
  }
  kbd {
    font: 600 11px/1 var(--font-ui);
    padding: 2px 5px;
    border: 1px solid var(--line);
    border-bottom-width: 2px;
    border-radius: 4px;
  }
  .primary {
    justify-self: center;
  }
</style>
