<script lang="ts">
  import { FULL_DUST, FULL_PULLS, seasonBack, seasonCharm, STAR_DUST, STAR_TOKENS, TRACK, type Constellation } from '@idlesuits/engine';
  import { findCharm } from '@idlesuits/sim';
  import { cardStyle, setCardBack } from '../lib/cardStyle.svelte';
  import { BACKS, rewardText, stars, timeLeft } from '../lib/stars.svelte';
  import CharmArt from './charms/CharmArt.svelte';
  import { formatTokens } from './charms/format';
  import TokenCounter from './charms/TokenCounter.svelte';

  let { onExit }: { onExit: () => void } = $props();

  let busy = $state(false);
  let error = $state<string | null>(null);

  async function choose(id: string) {
    busy = true;
    error = null;
    const out = await stars.choose(id);
    if (!out.ok) error = out.error;
    busy = false;
  }

  async function claim(tiers?: number[]) {
    busy = true;
    error = null;
    const out = await stars.claim(tiers);
    if (!out.ok) error = out.error;
    busy = false;
  }

  const pass = $derived(stars.pass);
  const clock = $derived(stars.clock);
  const chosen = $derived(stars.chosen);
  const ready = $derived(stars.claimable);
  /** How far along the track the stardust is, 0–1. */
  const along = $derived(Math.min(1, pass.dust / TRACK[TRACK.length - 1]!.dust));

  /** Lit stars of a constellation: the chosen one's, or the missions done of one not chosen yet (shown, not paid). */
  function litOf(c: Constellation): number[] {
    if (pass.chosen === c.id) return pass.lit;
    const counts = stars.counts(c.id);
    return c.missions.map((m, i) => (counts[i]! >= m.need ? i : -1)).filter((i) => i >= 0);
  }

  const pct = (have: number, need: number) => `${Math.min(100, (have / need) * 100)}%`;
  const fmt = (n: number) => (n >= 1000 ? formatTokens(n) : String(Math.floor(n)));
</script>

{#snippet sky(c: Constellation, lit: number[], big: boolean)}
  <svg class="sky" class:big viewBox="0 0 100 62" role="img" aria-label="{c.name}: {lit.length} of 6 stars lit">
    {#each c.lines as [a, b], i (i)}
      {@const on = lit.includes(a) && lit.includes(b)}
      <line x1={c.stars[a]![0]} y1={c.stars[a]![1]} x2={c.stars[b]![0]} y2={c.stars[b]![1]} class:on />
    {/each}
    {#each c.stars as [x, y], i (i)}
      {@const on = lit.includes(i)}
      <g class="star" class:on transform="translate({x} {y})">
        {#if on}<circle r="5" class="glow" />{/if}
        <path d="M0-3.6l1 2.4 2.6.2-2 1.7.6 2.5L0 1.9l-2.2 1.3.6-2.5-2-1.7 2.6-.2z" transform="scale({1 + i * 0.08})" />
      </g>
    {/each}
  </svg>
{/snippet}

{#snippet missions(c: Constellation, mine: boolean)}
  {@const counts = stars.counts(c.id)}
  <ol class="missions">
    {#each c.missions as m, i (i)}
      {@const have = counts[i] ?? 0}
      {@const done = mine ? pass.lit.includes(i) : have >= m.need}
      <li class:done>
        <span class="mark" aria-hidden="true">{done ? '★' : '☆'}</span>
        <span class="what">
          <b>{m.text}</b>
          <span class="progress"><span style:width={pct(have, m.need)}></span></span>
        </span>
        <span class="count">{done ? 'Lit' : `${fmt(have)} / ${fmt(m.need)}`}</span>
        <span class="pay">◉ {STAR_TOKENS[i]} · ✦ {STAR_DUST[i]}</span>
      </li>
    {/each}
  </ol>
{/snippet}

<div class="page">
  <header class="bar">
    <button type="button" onclick={onExit} aria-label="Back to the floor">←</button>
    <h1>Lucky <span>Stars</span></h1>
    <div class="money">
      <span class="dust" title="Stardust this season">✦ {pass.dust}</span>
      <TokenCounter href="#/charms" />
    </div>
  </header>

  <p class="season">
    Season {clock.season + 1} · week {clock.weekOfSeason} of 4 · this week's stars end in {timeLeft(clock.weekEnds - stars.now)}, the season in {timeLeft(clock.seasonEnds - stars.now)}
  </p>

  {#if stars.boostLeft > 0 || pass.freePulls > 0}
    <div class="perks">
      {#if stars.boostLeft > 0}<span class="perk boost">Tokens ×2 · {timeLeft(stars.boostLeft)} left</span>{/if}
      {#if pass.freePulls > 0}<a class="perk" href="#/charms">{pass.freePulls} free {pass.freePulls === 1 ? 'pull' : 'pulls'} at the Charm Machine →</a>{/if}
    </div>
  {/if}

  {#if error}<p class="error">{error}</p>{/if}

  {#if !chosen}
    <section class="panel">
      <h2>Choose this week's constellation</h2>
      <p class="note">
        Each star is a mission. Finish it to light the star: Tokens now, and stardust for the season's track. Light all six for {FULL_DUST} more stardust
        and a free pull. Your rounds count toward all three until you choose, so nothing played is lost.
      </p>
      <div class="offer">
        {#each stars.offer as c (c.id)}
          <article class="choice">
            {@render sky(c, litOf(c), false)}
            <h3>{c.name}</h3>
            <p class="note">{c.blurb}</p>
            {@render missions(c, false)}
            <button type="button" class="primary" disabled={busy} onclick={() => choose(c.id)}>Choose {c.name}</button>
          </article>
        {/each}
      </div>
    </section>
  {:else}
    <section class="panel mine">
      <div class="map">
        {@render sky(chosen, pass.lit, true)}
        <div class="title">
          <h2>{chosen.name}</h2>
          <p class="note">{chosen.blurb}</p>
          <p class="lit">{pass.lit.length} of 6 stars lit{pass.lit.length === 6 ? ` · complete! +${FULL_DUST} stardust, +${FULL_PULLS} free pull` : ''}</p>
        </div>
      </div>
      {@render missions(chosen, true)}
      <p class="note">Every round counts, at any table or machine, auto play included. A new choice of constellations comes on Monday.</p>
    </section>
  {/if}

  <section class="panel">
    <div class="track-head">
      <div>
        <h2>Season track</h2>
        <p class="note">
          ✦ {pass.dust} stardust{stars.nextTier >= 0 ? ` · ${TRACK[stars.nextTier]!.dust - pass.dust} more for the next reward` : ' · every reward reached'}. Rewards left unclaimed
          when the season ends are claimed for you.
        </p>
      </div>
      {#if ready.length > 1}<button type="button" class="primary" disabled={busy} onclick={() => claim()}>Claim all ({ready.length})</button>{/if}
    </div>
    <div class="meter" aria-hidden="true"><span style:width="{along * 100}%"></span></div>
    <ol class="track">
      {#each TRACK as tier, i (i)}
        {@const claimed = pass.claimed.includes(i)}
        {@const can = ready.includes(i)}
        <li class:claimed class:can class:locked={!claimed && !can}>
          <span class="need">✦ {tier.dust}</span>
          <span class="art">
            {#if tier.reward.kind === 'charm'}
              <CharmArt id={seasonCharm(pass.season, tier.reward.slot)} hidden={!claimed} />
            {:else if tier.reward.kind === 'back'}
              {@const b = BACKS[seasonBack(pass.season, tier.reward.slot)]!}
              <span class="mini-back" style:--back={b.color}>{b.glyph}</span>
            {:else if tier.reward.kind === 'tokens'}
              <span class="glyph">◉</span>
            {:else if tier.reward.kind === 'pulls'}
              <span class="glyph">❂</span>
            {:else}
              <span class="glyph">×2</span>
            {/if}
          </span>
          <span class="name">{rewardText(tier.reward, pass.season)}</span>
          {#if tier.reward.kind === 'charm'}<small>Starbound charm</small>{/if}
          {#if claimed}
            <small class="state">Claimed</small>
          {:else if can}
            <button type="button" class="primary" disabled={busy} onclick={() => claim([i])}>Claim</button>
          {:else}
            <small class="state">Locked</small>
          {/if}
        </li>
      {/each}
    </ol>
  </section>

  <section class="panel">
    <h2>Card backs</h2>
    <p class="note">Won on the track, kept for good. Every table deals with the back you pick.</p>
    <div class="backs">
      <button type="button" class="back-pick" aria-pressed={cardStyle.back === 'classic'} onclick={() => setCardBack('classic')}>
        <span class="mini-back classic">♠</span>Classic
      </button>
      {#each Object.entries(BACKS) as [id, b] (id)}
        {@const owned = pass.backs.includes(id)}
        <button type="button" class="back-pick" aria-pressed={cardStyle.back === id} disabled={!owned} onclick={() => setCardBack(id)}>
          <span class="mini-back" class:missing={!owned} style:--back={b.color}>{owned ? b.glyph : '?'}</span>{owned ? b.name : 'Not yet won'}
        </button>
      {/each}
    </div>
  </section>

  {#if pass.claimed.length || Object.keys(pass.progress).length}
    <p class="foot note">
      Starbound charms: {[0, 1].map((s) => findCharm(seasonCharm(pass.season, s as 0 | 1))?.name).join(' and ')} this season. Found nowhere else.
    </p>
  {/if}
</div>

<style>
  .page {
    max-width: 960px;
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
    gap: 10px;
  }
  .dust {
    font: 700 16px/1 var(--font-display);
    color: #8fd8ff;
  }
  .season,
  .note,
  .error {
    margin: 0;
    font: 13px/1.45 var(--font-ui);
    color: var(--muted);
  }
  .season {
    text-align: center;
  }
  .error {
    color: #ff9a8a;
    text-align: center;
  }
  .perks {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
  }
  .perk {
    padding: 6px 12px;
    border-radius: 999px;
    background: rgb(143 216 255 / 0.12);
    box-shadow: inset 0 0 0 1px rgb(143 216 255 / 0.45);
    font: 600 13px/1 var(--font-ui);
    color: #cfeeff;
    text-decoration: none;
  }
  .perk.boost {
    background: rgb(242 198 78 / 0.15);
    box-shadow: inset 0 0 0 1px rgb(242 198 78 / 0.6);
    color: var(--gold);
  }
  .panel {
    display: grid;
    gap: 12px;
    padding: 14px 16px;
    border-radius: 12px;
    background: var(--rail);
  }
  h2,
  h3 {
    margin: 0;
    font: 700 18px/1.1 var(--font-display);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  h3 {
    font-size: 16px;
    color: var(--gold);
  }
  .offer {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }
  .choice {
    display: grid;
    gap: 8px;
    align-content: start;
    padding: 12px;
    border-radius: 12px;
    background: rgb(0 0 0 / 0.25);
  }
  .choice button {
    margin-top: auto;
  }

  /* The night sky, and its stars. */
  .sky {
    display: block;
    width: 100%;
    aspect-ratio: 100 / 62;
    border-radius: 10px;
    background:
      radial-gradient(1px 1px at 12% 20%, rgb(255 255 255 / 0.6), transparent),
      radial-gradient(1px 1px at 78% 70%, rgb(255 255 255 / 0.5), transparent),
      radial-gradient(1px 1px at 40% 85%, rgb(255 255 255 / 0.4), transparent),
      radial-gradient(1px 1px at 92% 15%, rgb(255 255 255 / 0.5), transparent),
      radial-gradient(1px 1px at 60% 45%, rgb(255 255 255 / 0.3), transparent),
      radial-gradient(ellipse at 50% 120%, #1c2a52, #0a0f22 70%);
  }
  .sky line {
    stroke: rgb(143 216 255 / 0.18);
    stroke-width: 0.6;
    stroke-dasharray: 1.5 1.5;
  }
  .sky line.on {
    stroke: rgb(255 214 110 / 0.75);
    stroke-dasharray: none;
  }
  .star path {
    fill: #3a4a6e;
    stroke: #8fa6d6;
    stroke-width: 0.3;
  }
  .star.on path {
    fill: #ffd76a;
    stroke: #fff4c2;
  }
  .glow {
    fill: rgb(255 214 110 / 0.25);
    filter: blur(1.5px);
    animation: twinkle 3s ease-in-out infinite;
  }
  @keyframes twinkle {
    50% {
      opacity: 0.5;
    }
  }
  .map {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
    gap: 14px;
    align-items: center;
  }
  .title {
    display: grid;
    gap: 6px;
  }
  .lit {
    margin: 0;
    font: 700 15px/1.2 var(--font-display);
    color: var(--gold);
    letter-spacing: 0.03em;
  }

  .missions {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  .missions li {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr) auto;
    grid-template-areas: 'mark what count' 'mark what pay';
    column-gap: 8px;
    align-items: center;
    padding: 7px 9px;
    border-radius: 9px;
    background: rgb(0 0 0 / 0.22);
  }
  .missions .mark {
    grid-area: mark;
    color: #6f7fa6;
    font-size: 15px;
  }
  .missions li.done .mark {
    color: #ffd76a;
  }
  .what {
    grid-area: what;
    display: grid;
    gap: 5px;
    min-width: 0;
  }
  .what b {
    font: 600 13px/1.25 var(--font-ui);
  }
  .progress {
    display: block;
    height: 4px;
    border-radius: 2px;
    background: rgb(255 255 255 / 0.08);
    overflow: hidden;
  }
  .progress span {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, #6fb6ff, #ffd76a);
  }
  .count {
    grid-area: count;
    justify-self: end;
    font: 600 12px/1 var(--font-ui);
    color: #f6ecd6;
  }
  .done .count {
    color: #ffd76a;
  }
  .pay {
    grid-area: pay;
    justify-self: end;
    font: 11px/1 var(--font-ui);
    color: var(--muted);
  }
  .choice .pay {
    display: none;
  }
  .choice .missions li {
    grid-template-areas: 'mark what count';
    grid-template-rows: auto;
  }

  .track-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    flex-wrap: wrap;
  }
  .meter {
    height: 6px;
    border-radius: 3px;
    background: rgb(255 255 255 / 0.08);
    overflow: hidden;
  }
  .meter span {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, #6fb6ff, #8fd8ff 60%, #ffd76a);
  }
  .track {
    list-style: none;
    margin: 0;
    padding: 0 0 4px;
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 112px;
    gap: 8px;
    overflow-x: auto;
    scroll-snap-type: x proximity;
  }
  .track li {
    scroll-snap-align: start;
    display: grid;
    justify-items: center;
    align-content: start;
    gap: 6px;
    padding: 10px 8px;
    border-radius: 10px;
    background: rgb(0 0 0 / 0.25);
    text-align: center;
  }
  .track li.can {
    box-shadow: inset 0 0 0 1px rgb(242 198 78 / 0.8);
    background: rgb(242 198 78 / 0.1);
  }
  .track li.locked {
    opacity: 0.6;
  }
  .need {
    font: 700 12px/1 var(--font-display);
    color: #8fd8ff;
  }
  .art {
    display: grid;
    place-items: center;
    height: 52px;
    --art: 44px;
  }
  .glyph {
    font: 700 26px/1 var(--font-display);
    color: var(--gold);
  }
  .name {
    font: 600 12px/1.25 var(--font-ui);
  }
  .track small {
    font: 11px/1.2 var(--font-ui);
    color: var(--muted);
  }
  .track .state {
    margin-top: auto;
  }
  .track li.claimed .state {
    color: #8fd8ff;
  }
  .track button {
    min-height: 0;
    padding: 6px 12px;
    font-size: 12px;
  }

  .mini-back {
    display: inline-grid;
    place-items: center;
    width: 30px;
    height: 42px;
    border-radius: 4px;
    border: 3px solid #f6f1e6;
    background:
      repeating-linear-gradient(45deg, transparent 0 3px, rgb(255 255 255 / 0.12) 3px 4px),
      linear-gradient(160deg, color-mix(in srgb, var(--back) 80%, #fff), var(--back) 45%, color-mix(in srgb, var(--back) 70%, #000));
    color: #fff;
    font-size: 14px;
    box-shadow: 0 2px 4px rgb(0 0 0 / 0.4);
  }
  .mini-back.classic {
    --back: #8c2330;
  }
  .mini-back.missing {
    --back: #333;
    color: #888;
  }
  .backs {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .back-pick {
    display: grid;
    justify-items: center;
    gap: 6px;
    min-width: 86px;
    padding: 10px;
    border-radius: 10px;
    background: rgb(0 0 0 / 0.25);
    font: 600 12px/1 var(--font-ui);
  }
  .back-pick[aria-pressed='true'] {
    box-shadow: inset 0 0 0 2px var(--gold);
  }
  .foot {
    text-align: center;
  }

  @media (max-width: 760px) {
    .offer {
      grid-template-columns: minmax(0, 1fr);
    }
    .map {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .glow {
      animation: none;
    }
  }
</style>
