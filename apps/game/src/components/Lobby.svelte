<script lang="ts">
  import { bankroll } from '../lib/casino.svelte';
  import { GAMES, type GameEntry } from '../lib/games';
  import { formatMoney } from '../lib/money';

  let { onPlay }: { onPlay: (game: GameEntry) => void } = $props();
</script>

<div class="lobby">
  <header>
    <div>
      <h1>The Floor</h1>
      <p class="sub">Pick a table. Your money follows you from game to game.</p>
    </div>
    <div class="bank">
      <span class="k">Bank</span>
      <span class="v">{formatMoney(bankroll.balance)}</span>
    </div>
  </header>

  <ul class="games">
    {#each GAMES as game (game.id)}
      {@const open = game.load !== undefined}
      <li>
        <article class="card" class:soon={!open} style:--accent={game.accent}>
          <div class="motif" aria-hidden="true">
            {#each game.motif as m, i (i)}<span>{m}</span>{/each}
          </div>

          <div class="text">
            <h2>{game.name}</h2>
            <p class="tagline">{game.tagline}</p>
            <p class="blurb">{game.blurb}</p>
            <ul class="facts">
              {#each game.facts as fact (fact)}
                <li>{fact}</li>
              {/each}
            </ul>
          </div>

          {#if open}
            <button type="button" class="primary" onclick={() => onPlay(game)}>Play {game.name}</button>
          {:else}
            <p class="pending">Table closed · in development</p>
          {/if}
        </article>
      </li>
    {/each}
  </ul>
</div>

<style>
  .lobby {
    min-height: 100dvh;
    padding: 24px 16px calc(32px + env(safe-area-inset-bottom));
    display: grid;
    align-content: start;
    gap: 24px;
    max-width: 1100px;
    margin: 0 auto;
  }
  header {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    justify-content: space-between;
    gap: 12px 20px;
  }
  h1 {
    margin: 0;
    font: 700 clamp(28px, 6vw, 40px) / 1 var(--font-display);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--gold);
  }
  .sub {
    margin: 6px 0 0;
    color: var(--muted);
    font: 14px/1.4 var(--font-ui);
  }
  .bank {
    display: grid;
    gap: 2px;
    justify-items: end;
  }
  .k {
    font: 600 10px/1 var(--font-ui);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .v {
    font: 700 26px/1 var(--font-display);
    color: var(--gold);
    font-variant-numeric: tabular-nums;
  }

  .games {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 16px;
  }
  .card {
    height: 100%;
    display: grid;
    grid-template-rows: auto 1fr auto;
    gap: 14px;
    padding: 18px;
    border-radius: 16px;
    border: 1px solid var(--line);
    background:
      radial-gradient(120% 80% at 50% 0%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 70%),
      var(--rail);
  }
  .card.soon {
    opacity: 0.62;
  }
  .motif {
    display: flex;
    gap: 8px;
    justify-content: center;
    padding: 14px 0;
    border-radius: 12px;
    background: radial-gradient(ellipse at center, var(--felt) 0%, var(--felt-deep) 100%);
  }
  .motif span {
    font: 700 clamp(22px, 5vw, 30px) / 1 var(--font-display);
    color: var(--accent);
    opacity: 0.9;
  }
  .motif span:nth-child(even) {
    color: var(--ink);
    opacity: 0.55;
  }
  h2 {
    margin: 0;
    font: 700 22px/1.1 var(--font-display);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .tagline {
    margin: 4px 0 0;
    color: var(--accent);
    font: 600 13px/1.3 var(--font-ui);
  }
  .blurb {
    margin: 8px 0 0;
    color: var(--muted);
    font: 13px/1.5 var(--font-ui);
  }
  .facts {
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 10px 0 0;
    padding: 0;
  }
  .facts li {
    padding: 3px 9px;
    border-radius: 999px;
    background: var(--chip-bg);
    color: var(--muted);
    font: 500 11px/1.4 var(--font-ui);
  }
  .pending {
    margin: 0;
    text-align: center;
    font: 600 12px/1 var(--font-ui);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    padding: 12px 0;
  }
  .card .primary {
    width: 100%;
    font-size: 16px;
    padding: 12px 18px;
  }
</style>
