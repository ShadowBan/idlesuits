<script lang="ts">
  import { CHARMS } from '@idlesuits/sim';
  import { account } from '../lib/account.svelte';
  import { bankroll } from '../lib/casino.svelte';
  import { findGame } from '../lib/games';
  import { jackpots } from '../lib/jackpot.svelte';
  import { meta } from '../lib/meta.svelte';
  import { Decimal, formatMoney } from '../lib/money';
  import { stats } from '../lib/stats.svelte';
  import { ui } from '../lib/ui.svelte';
  import BankCounter from './BankCounter.svelte';
  import TokenCounter from './charms/TokenCounter.svelte';

  let { onExit }: { onExit: () => void } = $props();

  const t = $derived(stats.totals);
  const found = $derived(CHARMS.filter((c) => (meta.collection[c.id] ?? 0) > 0).length);
  const games = $derived(
    Object.entries(stats.data.games)
      .map(([id, g]) => ({ id, name: findGame(id)?.name ?? id, ...g }))
      .sort((a, b) => b.rounds - a.rounds),
  );
  const date = (at: number) => new Date(at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  const ago = (at: number) => {
    const m = Math.round((Date.now() - at) / 60_000);
    return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
  };
  const signed = (d: Decimal) => formatMoney(d, true);
  const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : '—');
  /** A short member number from the account id, for the card. */
  const memberNo = $derived(account.user ? account.user.id.replace(/-/g, '').slice(0, 8).toUpperCase().replace(/(.{4})/, '$1 ') : '');

  /** Achievements are coming: a shelf of locked badges for now. */
  const SOON = ['First win', 'High roller', 'Jackpot!', 'Collector', 'Night owl', 'Grand tour'];
</script>

<div class="page">
  <header class="bar">
    <button type="button" onclick={onExit} aria-label="Back to the floor">←</button>
    <h1>Players <span>Club</span></h1>
    <div class="money">
      <BankCounter bank={bankroll.balance} />
      <TokenCounter href="#/charms" />
    </div>
  </header>

  <!-- The member card: who they are at the casino. A guest's card asks them in. -->
  <section class="card" class:guest={!account.user}>
    <div class="face">
      <span class="brand">Idle Suits · Players Club</span>
      {#if account.user}
        <b class="name">{account.user.name}</b>
        <span class="no">Member {memberNo}</span>
        <span class="since">{account.user.createdAt ? `Member since ${date(account.user.createdAt)}` : 'Member'}{account.admin ? ' · Pit boss' : ''}</span>
      {:else}
        <b class="name">Guest</b>
        <span class="since">Playing in this browser only</span>
      {/if}
      <span class="chip" aria-hidden="true"></span>
    </div>
    <div class="pitch">
      {#if account.user}
        <p>Your bank, Tokens, charms and every table's progress are saved to your membership and follow you to any device you sign in on.</p>
        <p class="muted">Tiers, comps and achievements are on their way.</p>
      {:else if account.online}
        <p><b>Join the Players Club</b> to keep your progress safe and take it to any device, with your own profile and stats.</p>
        <button type="button" class="primary" onclick={() => (ui.settingsOpen = true)}>Join or sign in</button>
      {:else}
        <p>The Players Club opens when the casino's server is online. Your progress is saved in this browser meanwhile.</p>
      {/if}
    </div>
  </section>

  <!-- The lifetime record. -->
  <section class="panel">
    <h2>Lifetime <span>{stats.data.since ? `counted since ${date(stats.data.since)}` : 'from your first round'}</span></h2>
    <div class="tiles">
      <div><span>Rounds played</span><b>{t.rounds.toLocaleString('en-US')}</b><small>{pct(t.wins, t.rounds)} won</small></div>
      <div><span>Total bet</span><b>{formatMoney(t.wagered)}</b></div>
      <div><span>Net</span><b class:win={t.net.gt(0)} class:loss={t.net.lt(0)}>{signed(t.net)}</b></div>
      <div><span>Biggest win</span><b>{formatMoney(t.biggest)}</b><small>{t.bestX ? `best ${t.bestX >= 100 ? t.bestX.toFixed(0) : t.bestX.toFixed(1)}× a bet` : ''}</small></div>
      <div><span>Best bank</span><b>{formatMoney(new Decimal(stats.data.peakBank).max(bankroll.balance))}</b></div>
      <div><span>Tokens earned</span><b class="tok">◉ {Math.round(meta.lifetimeTokens).toLocaleString('en-US')}</b></div>
      <div><span>Charms found</span><b>{found} / {CHARMS.length}</b></div>
      <div><span>Jackpots hit</span><b>{jackpots.history.length}</b></div>
    </div>
  </section>

  <!-- Game by game, most played first. -->
  <section class="panel">
    <h2>Game by game</h2>
    {#if games.length}
      <div class="games" role="table" aria-label="Your record at each game">
        <div class="row head" role="row">
          <span role="columnheader">Game</span><span role="columnheader">Rounds</span><span role="columnheader">Net</span><span role="columnheader">Biggest win</span><span role="columnheader">Last played</span>
        </div>
        {#each games as g (g.id)}
          {@const net = new Decimal(g.net)}
          <div class="row" role="row">
            <b role="cell">{g.name}</b>
            <span role="cell">{g.rounds.toLocaleString('en-US')}</span>
            <span role="cell" class:win={net.gt(0)} class:loss={net.lt(0)}>{signed(net)}</span>
            <span role="cell">{new Decimal(g.biggestWin).gt(0) ? formatMoney(new Decimal(g.biggestWin)) : '—'}</span>
            <span role="cell" class="muted">{ago(g.lastPlayed)}</span>
          </div>
        {/each}
      </div>
    {:else}
      <p class="muted">Play a round anywhere on the floor and it's counted here.</p>
    {/if}
  </section>

  <!-- Achievements: coming. -->
  <section class="panel">
    <h2>Achievements <span>coming soon</span></h2>
    <div class="badges">
      {#each SOON as name (name)}
        <div class="badge" title="{name}: coming soon">
          <span aria-hidden="true">★</span>
          <small>{name}</small>
        </div>
      {/each}
    </div>
  </section>
</div>

<style>
  .page {
    max-width: 1000px;
    margin: 0 auto;
    padding: 12px 12px calc(32px + env(safe-area-inset-bottom));
    display: grid;
    gap: 12px;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 14px;
    border-radius: 12px;
    background: var(--rail);
  }
  h1 {
    margin: 0 auto 0 0;
    font: 700 22px/1 var(--font-display);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  h1 span {
    color: var(--gold);
  }
  .money {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  /* The member card: black and gold, like a casino's loyalty card. */
  .card {
    display: grid;
    grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
    align-items: center;
    gap: 20px;
    padding: 18px;
    border-radius: 16px;
    background: var(--rail);
  }
  .face {
    position: relative;
    display: grid;
    align-content: end;
    gap: 6px;
    aspect-ratio: 1.586;
    padding: 18px 20px;
    border-radius: 14px;
    overflow: hidden;
    background:
      radial-gradient(ellipse 80% 60% at 85% 0%, rgb(242 198 78 / 0.35), transparent 60%),
      repeating-linear-gradient(135deg, rgb(255 255 255 / 0.03) 0 2px, transparent 2px 8px),
      linear-gradient(135deg, #1d1610, #0d0a07);
    box-shadow:
      inset 0 0 0 1px rgb(242 198 78 / 0.55),
      0 12px 30px rgb(0 0 0 / 0.5);
    color: #f6ecd6;
  }
  .guest .face {
    background:
      repeating-linear-gradient(135deg, rgb(255 255 255 / 0.03) 0 2px, transparent 2px 8px),
      linear-gradient(135deg, #22262c, #121417);
    box-shadow:
      inset 0 0 0 1px rgb(255 255 255 / 0.15),
      0 12px 30px rgb(0 0 0 / 0.5);
  }
  .brand {
    position: absolute;
    top: 16px;
    left: 20px;
    font: 700 12px/1 var(--font-display);
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--gold);
  }
  .guest .brand {
    color: #b8c0cc;
  }
  .chip {
    position: absolute;
    top: 40%;
    left: 20px;
    width: 42px;
    height: 32px;
    border-radius: 6px;
    background: linear-gradient(135deg, #f6d98a, #b8862e);
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.3);
  }
  .name {
    font: 700 26px/1.1 var(--font-display);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .no {
    font: 600 14px/1 var(--font-ui);
    letter-spacing: 0.14em;
    font-variant-numeric: tabular-nums;
    color: rgb(246 236 214 / 0.75);
  }
  .since {
    font: 12px/1.2 var(--font-ui);
    color: rgb(246 236 214 / 0.6);
  }
  .pitch {
    display: grid;
    gap: 10px;
    justify-items: start;
    font: 15px/1.5 var(--font-ui);
  }
  .pitch p {
    margin: 0;
  }

  .panel {
    display: grid;
    gap: 12px;
    padding: 14px 16px;
    border-radius: 12px;
    background: var(--rail);
  }
  h2 {
    margin: 0;
    display: flex;
    justify-content: space-between;
    gap: 10px;
    font: 600 12px/1 var(--font-ui);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
  }
  h2 span {
    letter-spacing: 0;
    text-transform: none;
    font-weight: 400;
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }
  .tiles div {
    display: grid;
    gap: 4px;
    padding: 10px 12px;
    border-radius: 10px;
    background: rgb(0 0 0 / 0.22);
  }
  .tiles span {
    font: 600 11px/1 var(--font-ui);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .tiles b {
    font: 700 22px/1.1 var(--font-display);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tiles small {
    font: 12px/1 var(--font-ui);
    color: var(--muted);
  }
  .tok {
    color: #f2d27a;
  }
  .win {
    color: #8cf0b8;
  }
  .loss {
    color: #ff9a8a;
  }
  .muted {
    color: var(--muted);
  }

  .games {
    display: grid;
    gap: 2px;
    font: 14px/1.3 var(--font-ui);
    font-variant-numeric: tabular-nums;
  }
  .row {
    display: grid;
    grid-template-columns: minmax(0, 2fr) repeat(4, minmax(0, 1fr));
    gap: 10px;
    padding: 8px 10px;
    border-radius: 8px;
  }
  .row:not(.head):nth-child(even) {
    background: rgb(255 255 255 / 0.03);
  }
  .row.head {
    font: 600 11px/1 var(--font-ui);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .row b {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .badges {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 8px;
  }
  .badge {
    display: grid;
    justify-items: center;
    gap: 6px;
    padding: 12px 6px;
    border-radius: 12px;
    background: rgb(0 0 0 / 0.22);
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.06);
    opacity: 0.55;
  }
  .badge span {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: rgb(255 255 255 / 0.06);
    font-size: 22px;
    color: rgb(255 255 255 / 0.25);
  }
  .badge small {
    font: 600 11px/1.2 var(--font-ui);
    text-align: center;
    color: var(--muted);
  }

  @media (max-width: 760px) {
    .card {
      grid-template-columns: minmax(0, 1fr);
    }
    .tiles {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .row {
      grid-template-columns: minmax(0, 1.6fr) repeat(2, minmax(0, 1fr));
    }
    .row > :nth-child(4),
    .row > :nth-child(5) {
      display: none;
    }
    .badges {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
</style>
