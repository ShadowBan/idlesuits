<script lang="ts">
  import { account } from '../lib/account.svelte';
  import { bankroll } from '../lib/casino.svelte';
  import { floor } from '../lib/floor.svelte';
  import { formatLimit, room } from '../lib/rooms';
  import { ui } from '../lib/ui.svelte';
  import { deckLabel, GAMES, INSTANT, SLOTS } from '../lib/games';
  import { jackpots, MAJOR_CAP } from '../lib/jackpot.svelte';
  import { formatMoney } from '../lib/money';
  import { CHARMS } from '@idlesuits/sim';
  import { tuning } from '../lib/tuning.svelte';
  import { meta } from '../lib/meta.svelte';
  import { stars } from '../lib/stars.svelte';
  import CharmArt from './charms/CharmArt.svelte';
  import { recent } from '../lib/recent.svelte';
  import { load, save } from '../lib/save';
  import TokenCounter from './charms/TokenCounter.svelte';

  let { onPlay }: { onPlay: (game: { id: string }) => void } = $props();

  type Tab = 'tables' | 'slots' | 'instant';
  const TABS = $derived<{ id: Tab; label: string; count: number }[]>([
    { id: 'tables', label: 'Tables', count: GAMES.length },
    { id: 'slots', label: 'Slot floor', count: SLOTS.length },
    { id: 'instant', label: 'Instant games', count: INSTANT.length },
  ]);
  const saved = load<string>('lobby.tab', 'tables');
  let tab = $state<Tab>(saved === 'slots' || saved === 'instant' ? saved : 'tables');
  function setTab(t: Tab) {
    tab = t;
    save('lobby.tab', t);
  }
  /** The games played last, newest first, with what kind each is. */
  const lastPlayed = $derived(
    recent.ids
      .map((id) => {
        const t = GAMES.find((g) => g.id === id);
        if (t) return { ...t, kind: 'Table' };
        const sl = SLOTS.find((g) => g.id === id);
        if (sl) return { ...sl, kind: 'Slot' };
        const ins = INSTANT.find((g) => g.id === id);
        return ins ? { ...ins, kind: ins.kind } : null;
      })
      .filter((g) => g !== null && g.load !== undefined)
      .slice(0, 4) as { id: string; name: string; motif: string[]; accent: string; kind: string }[],
  );

  /** Every opened room, and the next one as something to aim for. */
  const rooms = $derived(Array.from({ length: floor.best + 2 }, (_, i) => room(i)));
</script>

<div class="lobby">
  <header>
    <div>
      <h1>{floor.room.name}</h1>
      <p class="sub">Pick a table. Your money follows you from game to game.</p>
    </div>
    <div class="corner">
      <a class="club stars" href="#/stars" title="This week's constellation and the season track"
        ><span class="mark" aria-hidden="true">✦</span>Lucky Stars{#if stars.waiting}<span class="dot" aria-label="{stars.waiting} waiting">{stars.waiting}</span>{/if}</a
      >
      <a class="club leaders" href="#/leaders" title="This week's and all-time leaderboards"><span class="mark" aria-hidden="true">★</span>Leaderboards</a>
      <a class="club" href="#/club" title="Your Players Club profile">
        <span class="mark" aria-hidden="true">♠</span>{account.user ? account.user.name : 'Players Club'}
      </a>
      <button type="button" class="faces" onclick={() => (ui.settingsOpen = true)}>Settings</button>
      <div class="bank">
        <span class="k">Bank</span>
        <span class="v">{formatMoney(bankroll.balance)}</span>
      </div>
      {#if bankroll.broke}
        <!-- Too little to bet anywhere: back in at the starting stake. Tokens and charms are never lost. -->
        <button type="button" class="primary rebuy" onclick={() => bankroll.buyIn()}>Buy back in</button>
      {/if}
      <TokenCounter />
    </div>
  </header>

  <!-- Where to sit: each room's limits apply at every table in it. -->
  <section class="rooms" aria-label="Rooms">
    {#each rooms as r (r.index)}
      {@const open = r.index <= floor.best}
      {@const short = open && bankroll.balance.lt(r.min)}
      <button
        type="button"
        class="room"
        class:here={r.index === floor.current}
        aria-pressed={r.index === floor.current}
        disabled={!open || short}
        onclick={() => floor.enter(r.index)}
      >
        <span class="room-name">{open ? r.name : 'Locked'}</span>
        <b>{formatLimit(r.min)}–{formatLimit(r.max)}</b>
        {#if !open}
          <span class="perk">Opens at a {formatMoney(r.opensAt)} bank</span>
          <span class="meter" aria-hidden="true">
            <span style:width="{Math.min(100, bankroll.balance.div(r.opensAt).toNumber() * 100)}%"></span>
          </span>
        {:else if short}
          <span class="perk">Bank below the minimum</span>
        {:else}
          <span class="perk">{r.tokenBonus > 1 ? `Tokens ×${+r.tokenBonus.toFixed(2)}` : 'Side bets to ' + formatLimit(r.sideMax)}</span>
        {/if}
      </button>
    {/each}
  </section>

  <!-- The meta layer's front door: what's on, what's found, and whether there's a pull waiting. -->
  <a class="charms" href="#/charms">
    <span class="shelf" aria-hidden="true">
      {#each meta.equipped.length ? meta.equipped.map((e) => e.id) : ['horseshoe', 'four-leaf-clover', 'maneki-neko'] as id (id)}
        <CharmArt {id} hidden={!meta.equipped.length} />
      {/each}
    </span>
    <span class="charms-text">
      <b>Charm Machine</b>
      <span>
        {CHARMS.filter((c) => meta.collection[c.id]).length} of {CHARMS.length} charms found
        {#if meta.tokens >= tuning.values.pullCost}· <em>{Math.floor(meta.tokens / tuning.values.pullCost)} pulls ready</em>{/if}
      </span>
    </span>
    <span class="go">Open ›</span>
  </a>

  <!-- Back to what was played last. -->
  {#if lastPlayed.length}
    <section class="recent" aria-labelledby="recent-head">
      <h2 class="section" id="recent-head">Jump back in</h2>
      <div class="recent-row">
        {#each lastPlayed as g (g.id)}
          <button type="button" class="mini" style:--accent={g.accent} onclick={() => onPlay(g)}>
            <span class="glyph" aria-hidden="true">{g.motif[0]}</span>
            <span class="mini-text"><b>{g.name}</b><small>{g.kind}</small></span>
          </button>
        {/each}
      </div>
    </section>
  {/if}

  <!-- The floor in three rooms of its own: tables, slots and instant games, one at a time. -->
  <div class="tabs" role="tablist" aria-label="The floor">
    {#each TABS as t (t.id)}
      <button type="button" role="tab" aria-selected={tab === t.id} onclick={() => setTab(t.id)}>
        {t.label}<span>{t.count}</span>
      </button>
    {/each}
  </div>

  {#if tab === 'slots'}
    <!-- The slot floor: its machines share the linked progressives, which every hand in the casino feeds. -->
    <div class="meters" aria-label="Linked progressive jackpots">
      {#each [['Grand', jackpots.sharedMeters.grand], ['Major', jackpots.sharedMeters.major]] as const as [name, x] (name)}
        <span class="meter-box {name.toLowerCase()}">
          <span class="k">{name}</span>
          <b>{formatMoney(floor.room.min.mul(x))}</b>
          {#if name === 'Major'}<small>must hit by {formatLimit(floor.room.min.mul(MAJOR_CAP))}</small>{/if}
        </span>
      {/each}
      <span class="at">
        at a {formatLimit(floor.room.min)} spin · shared by every Players Club member, growing with every hand they play{jackpots.linked
          ? ''
          : ' · join the Players Club to play for it'}
      </span>
    </div>
  {:else if tab === 'instant'}
    <p class="at">Quick press-your-luck rounds: you choose the risk, and each pays back exactly what the floor sets.</p>
  {/if}

  <div role="tabpanel" aria-label={TABS.find((t) => t.id === tab)?.label}>
  <ul class="games">
    {#if tab === 'tables'}
      {#each GAMES as game (game.id)}
        <li>{@render card(game, deckLabel(game), false)}</li>
      {/each}
    {:else if tab === 'slots'}
      {#each SLOTS as slot (slot.id)}
        <li>{@render card(slot, slot.feature, true)}</li>
      {/each}
    {:else}
      {#each INSTANT as g (g.id)}
        <li>{@render card(g, g.kind, true)}</li>
      {/each}
    {/if}
  </ul>
  </div>
</div>

{#snippet card(g: { id: string; name: string; tagline: string; blurb: string; facts: string[]; motif: string[]; accent: string; load?: unknown }, label: string, cabinet: boolean)}
  {@const open = g.load !== undefined}
  <article class="card" class:soon={!open} style:--accent={g.accent}>
    <div class="motif" class:reels={cabinet} aria-hidden="true">
      {#each g.motif as m, i (i)}<span>{m}</span>{/each}
    </div>
    <div class="text">
      <h2>{g.name}</h2>
      <p class="tagline">{g.tagline}</p>
      <p class="blurb" title={g.blurb}>{g.blurb}</p>
      <ul class="facts">
        <li class="deck">{label}</li>
        {#each g.facts as fact (fact)}<li>{fact}</li>{/each}
      </ul>
    </div>
    {#if open}
      <button type="button" class="primary" onclick={() => onPlay(g)}>Play</button>
    {:else}
      <p class="pending">In development</p>
    {/if}
  </article>
{/snippet}

<style>
  .rooms {
    display: flex;
    gap: 10px;
    overflow-x: auto;
    padding-bottom: 4px;
    scrollbar-width: thin;
  }
  .room {
    flex: 0 0 auto;
    min-width: 150px;
    display: grid;
    justify-items: start;
    gap: 4px;
    padding: 10px 14px;
    border-radius: 12px;
    border: 1px solid var(--line);
    background: var(--rail);
    color: var(--ink);
    text-align: left;
  }
  .room.here {
    border-color: var(--gold);
    background: radial-gradient(circle at 0% 0%, rgb(242 198 78 / 0.18), transparent 70%), var(--rail);
  }
  .room:disabled {
    opacity: 0.6;
  }
  .room-name {
    font: 600 11px/1 var(--font-ui);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .room.here .room-name {
    color: var(--gold);
  }
  .room b {
    font: 700 20px/1 var(--font-display);
    font-variant-numeric: tabular-nums;
  }
  .perk {
    font: 12px/1.2 var(--font-ui);
    color: var(--muted);
  }
  .meter {
    width: 100%;
    height: 4px;
    border-radius: 2px;
    background: rgb(255 255 255 / 0.1);
    overflow: hidden;
  }
  .meter span {
    display: block;
    height: 100%;
    background: var(--gold);
  }
  .charms {
    --art: 40px;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 16px;
    border-radius: 14px;
    border: 1px solid rgb(242 198 78 / 0.35);
    background: radial-gradient(circle at 10% 50%, rgb(242 198 78 / 0.16), transparent 50%), var(--rail);
    color: var(--ink);
    text-decoration: none;
    transition: border-color 150ms ease;
  }
  .charms:hover {
    border-color: var(--gold);
  }
  .shelf {
    display: flex;
    gap: 2px;
  }
  .charms-text {
    display: grid;
    gap: 3px;
    margin-right: auto;
    font: 13px/1.3 var(--font-ui);
    color: var(--muted);
  }
  .charms-text b {
    font: 700 18px/1 var(--font-display);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--gold);
  }
  .charms-text em {
    font-style: normal;
    color: #f2d27a;
    font-weight: 600;
  }
  .go {
    font: 700 14px/1 var(--font-display);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--gold);
  }
  .corner {
    display: flex;
    align-items: end;
    gap: 16px;
  }
  .faces,
  .rebuy {
    min-height: 40px;
  }
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
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 14px;
  }
  /* The floor's three rooms, as tabs that stay in reach while the cards scroll. */
  .tabs {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    gap: 4px;
    padding: 5px;
    border-radius: 14px;
    background: color-mix(in srgb, var(--rail) 92%, transparent);
    backdrop-filter: blur(6px);
    box-shadow:
      inset 0 0 0 1px var(--line),
      0 6px 16px rgb(0 0 0 / 0.35);
  }
  .tabs button {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 44px;
    padding: 8px 10px;
    border: 0;
    border-radius: 10px;
    background: none;
    color: var(--muted);
    font: 700 15px/1 var(--font-display);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .tabs button span {
    padding: 2px 7px;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.08);
    font: 600 11px/1.2 var(--font-ui);
    letter-spacing: 0;
  }
  .tabs button[aria-selected='true'] {
    background: var(--gold);
    color: #1a1206;
  }
  .tabs button[aria-selected='true'] span {
    background: rgb(0 0 0 / 0.15);
  }
  /* On a phone: tabs on one line each, and cards without the blurb (the tagline and facts say enough). */
  @media (max-width: 520px) {
    .tabs button {
      gap: 5px;
      padding: 8px 4px;
      font-size: 12px;
      letter-spacing: 0.03em;
    }
    .tabs button span {
      padding: 1px 5px;
    }
    .card .blurb {
      display: none;
    }
    .games .card {
      gap: 8px;
      padding: 12px;
    }
  }
  .recent {
    display: grid;
    gap: 10px;
  }
  .recent h2.section {
    margin: 0;
  }
  .recent-row {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 10px;
  }
  .mini {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border-radius: 12px;
    border: 1px solid var(--line);
    background:
      radial-gradient(120% 120% at 0% 50%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 60%),
      var(--rail);
    color: var(--ink);
    text-align: left;
  }
  .mini:hover {
    border-color: var(--accent);
  }
  .glyph {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background: rgb(0 0 0 / 0.35);
    color: var(--accent);
    font: 700 20px/1 var(--font-display);
  }
  .mini-text {
    display: grid;
    gap: 3px;
  }
  .mini-text b {
    font: 700 15px/1 var(--font-display);
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }
  .mini-text small {
    font: 11px/1 var(--font-ui);
    color: var(--muted);
  }
  .card {
    height: 100%;
    display: grid;
    grid-template-rows: auto 1fr auto;
    gap: 10px;
    padding: 14px;
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
    padding: 8px 0;
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
  /* Three lines of the blurb at most; the whole of it is in the card's tooltip and the game's rules. */
  .blurb {
    margin: 6px 0 0;
    color: var(--muted);
    font: 13px/1.45 var(--font-ui);
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
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
  .facts .deck {
    color: var(--ink);
    box-shadow: inset 0 0 0 1px var(--line);
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
  h2.section {
    margin: 0 0 -10px;
    font: 700 15px/1 var(--font-display);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
  }



  .meters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 10px;
  }
  .meter-box {
    display: grid;
    gap: 3px;
    padding: 6px 12px;
    border-radius: 10px;
    background: #120a1e;
    box-shadow: inset 0 0 0 1px rgb(242 198 78 / 0.4);
  }
  .meter-box b {
    font: 700 20px/1 var(--font-display);
    font-variant-numeric: tabular-nums;
    color: #ffd75e;
  }
  .meter-box small {
    font: 10px/1 var(--font-ui);
    color: var(--muted);
  }
  .meter-box.major b {
    color: #ff6b8b;
  }
  .at {
    font: 12px/1.3 var(--font-ui);
    color: var(--muted);
  }
  /* A slot's motif sits on a dark cabinet glass rather than felt. */
  .motif.reels {
    background: radial-gradient(ellipse at center, #2a1745 0%, #110a1c 100%);
  }
  .card .primary {
    width: 100%;
    font-size: 16px;
    padding: 12px 18px;
  }
  /* The way to the Players Club: the member's name once they've joined. */
  .club {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 8px 14px;
    border-radius: 999px;
    background: linear-gradient(135deg, #2a2016, #15100b);
    box-shadow: inset 0 0 0 1px rgb(242 198 78 / 0.55);
    font: 600 14px/1 var(--font-ui);
    color: #f6ecd6;
    text-decoration: none;
    white-space: nowrap;
  }
  .club:hover {
    box-shadow: inset 0 0 0 1px rgb(242 198 78 / 0.9);
  }
  .club .mark {
    color: var(--gold);
  }
  .club.stars .mark {
    color: #8fd8ff;
  }
  .dot {
    display: inline-grid;
    place-items: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 999px;
    background: var(--gold);
    color: #1a1208;
    font: 700 11px/1 var(--font-ui);
  }
</style>
