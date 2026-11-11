<script lang="ts">
  import { account } from '../lib/account.svelte';
  import { api } from '../lib/api';
  import { findGame } from '../lib/games';
  import { Decimal, formatMoney } from '../lib/money';
  import { formatTokens } from './charms/format';

  let { onExit }: { onExit: () => void } = $props();

  type BoardId = 'win' | 'x' | 'net' | 'tokens';
  const BOARDS: { id: BoardId; label: string; blurb: string }[] = [
    { id: 'win', label: 'Biggest win', blurb: 'The largest single round, in dollars.' },
    { id: 'x', label: 'Best multiplier', blurb: 'The biggest win as a multiple of its bet: fair to every bankroll.' },
    { id: 'net', label: 'Net winnings', blurb: 'Won less lost, every game together.' },
    { id: 'tokens', label: 'Tokens earned', blurb: 'Tokens won at the tables and machines.' },
  ];

  interface Row {
    rank: number;
    name: string;
    value: string;
    detail: string | null;
    me: boolean;
  }
  interface Reply {
    board: BoardId;
    period: string;
    rows: Row[];
    mine: { rank: number; value: string; detail: string | null } | null;
  }

  let board = $state<BoardId>('win');
  let period = $state<'week' | 'all'>('week');
  let reply = $state<Reply | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(false);

  $effect(() => {
    const b = board;
    const p = period;
    loading = true;
    error = null;
    api<Reply>(`/leaderboard?board=${b}&period=${p}`)
      .then((r) => {
        if (board === b && period === p) reply = r;
      })
      .catch((e: Error) => (error = e.message))
      .finally(() => (loading = false));
  });

  /** A board's value as it reads: dollars, a multiple, or Tokens. */
  function show(id: BoardId, value: string): string {
    if (id === 'x') return `${Number(value) >= 100 ? Number(value).toFixed(0) : Number(value).toFixed(1)}×`;
    if (id === 'tokens') return `◉ ${formatTokens(Number(value))}`;
    try {
      return formatMoney(new Decimal(value), id === 'net');
    } catch {
      return value;
    }
  }

  /** What a win was: the round, and the game by its name. */
  const what = (detail: string | null) => detail?.replace(/ · ([a-z]+)$/, (_, id: string) => ` · ${findGame(id)?.name ?? id}`) ?? null;

  /** When this week's boards started over: the Monday its period is named for. */
  const weekStart = $derived(reply?.period.startsWith('w') ? new Date(`${reply.period.slice(1)}T00:00:00Z`) : null);
  const current = $derived(BOARDS.find((b) => b.id === board)!);
</script>

<div class="page">
  <header class="bar">
    <button type="button" onclick={onExit} aria-label="Back to the floor">←</button>
    <h1>Leader<span>boards</span></h1>
  </header>

  <div class="tabs" role="tablist" aria-label="Board">
    {#each BOARDS as b (b.id)}
      <button type="button" role="tab" aria-selected={board === b.id} onclick={() => (board = b.id)}>{b.label}</button>
    {/each}
  </div>

  <section class="panel">
    <div class="head">
      <div>
        <h2>{current.label}</h2>
        <p class="blurb">
          {current.blurb}
          {#if period === 'week' && weekStart}Since Monday {weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })}; starts over every Monday.{/if}
        </p>
      </div>
      <div class="period" role="group" aria-label="Period">
        <button type="button" aria-pressed={period === 'week'} onclick={() => (period = 'week')}>This week</button>
        <button type="button" aria-pressed={period === 'all'} onclick={() => (period = 'all')}>All-time</button>
      </div>
    </div>

    {#if error}
      <p class="note">{error}</p>
    {:else if !reply}
      <p class="note">{loading ? 'Loading…' : ''}</p>
    {:else if !reply.rows.length}
      <p class="note">Nobody on this board yet{period === 'week' ? ' this week' : ''}. It's yours to take.</p>
    {:else}
      <ol class="rows" class:dim={loading}>
        {#each reply.rows as r (r.rank)}
          <li class:me={r.me} class:podium={r.rank <= 3}>
            <span class="rank">{r.rank}</span>
            <span class="who">
              <b>{r.name}</b>
              {#if r.detail}<small>{what(r.detail)}</small>{/if}
            </span>
            <span class="value">{show(board, r.value)}</span>
          </li>
        {/each}
      </ol>
    {/if}

    {#if account.user}
      {#if reply?.mine && !reply.rows.some((r) => r.me)}
        <div class="mine">
          <span class="rank">{reply.mine.rank}</span>
          <span class="who"><b>You</b>{#if reply.mine.detail}<small>{what(reply.mine.detail)}</small>{/if}</span>
          <span class="value">{show(board, reply.mine.value)}</span>
        </div>
      {:else if reply && !reply.mine}
        <p class="note">You're not on this board yet{period === 'week' ? ' this week' : ''}: play a round to get on it.</p>
      {/if}
    {:else}
      <p class="note">Leaderboards are for Players Club members, whose rounds the casino decides. Join from Settings to get on them.</p>
    {/if}
  </section>
</div>

<style>
  .page {
    max-width: 800px;
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
  .tabs {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
  }
  .tabs button {
    padding: 10px 6px;
    border-radius: 10px;
    background: var(--rail);
    font: 600 13px/1.1 var(--font-ui);
  }
  .tabs button[aria-selected='true'] {
    background: var(--gold);
    color: #1a1208;
  }
  .panel {
    display: grid;
    gap: 12px;
    padding: 14px 16px;
    border-radius: 12px;
    background: var(--rail);
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    flex-wrap: wrap;
  }
  h2 {
    margin: 0 0 4px;
    font: 700 18px/1.1 var(--font-display);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .blurb,
  .note {
    margin: 0;
    font: 13px/1.4 var(--font-ui);
    color: var(--muted);
  }
  .period {
    display: flex;
    gap: 4px;
    padding: 3px;
    border-radius: 999px;
    background: rgb(0 0 0 / 0.3);
  }
  .period button {
    min-height: 0;
    padding: 6px 12px;
    border-radius: 999px;
    background: none;
    font: 600 12px/1 var(--font-ui);
  }
  .period button[aria-pressed='true'] {
    background: var(--gold);
    color: #1a1208;
  }
  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 4px;
    transition: opacity 0.2s;
  }
  .rows.dim {
    opacity: 0.5;
  }
  .rows li,
  .mine {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 10px;
    background: rgb(0 0 0 / 0.22);
  }
  .rows li.me,
  .mine {
    box-shadow: inset 0 0 0 1px rgb(242 198 78 / 0.7);
  }
  .rank {
    font: 700 16px/1 var(--font-display);
    text-align: center;
    color: var(--muted);
  }
  .podium .rank {
    color: var(--gold);
  }
  .who {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .who b {
    font: 600 14px/1.2 var(--font-ui);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .who small {
    font: 12px/1.2 var(--font-ui);
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .value {
    font: 700 16px/1 var(--font-display);
    color: #f6ecd6;
  }
  @media (max-width: 560px) {
    .tabs {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
