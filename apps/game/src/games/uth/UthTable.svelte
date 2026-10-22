<script lang="ts">
  import { onDestroy } from 'svelte';
  import { CATEGORY_NAMES } from '@idlesuits/sim';
  import CardRow from '../../components/CardRow.svelte';
  import TableShell from '../../components/TableShell.svelte';
  import type { GameProps } from '../../lib/games';
  import { formatMoney } from '../../lib/money';
  import { setMuted, unlockAudio } from '../../lib/sound';
  import { UthGame } from './game.svelte';
  import UthPanels from './UthPanels.svelte';
  import UthRules from './UthRules.svelte';

  let { onExit }: GameProps = $props();

  const game = new UthGame();
  const seq = game.seq;
  onDestroy(() => game.dispose());

  let muted = $state(false);
  let rules = $state<UthRules>();
  $effect(() => setMuted(muted));

  const FLIP_MS = { smart: 260, '1x': 300, '2x': 190, '5x': 90 } as const;
  const flipMs = $derived(FLIP_MS[seq.speed]);
  const pending = $derived(game.pending);

  /** The moves on offer right now, with the bet each one puts down. */
  const options = $derived.by(() => {
    if (!pending) return [];
    const { decision, suggestion } = pending;
    const list: { label: string; choice: { move: 'check' | 'fold' | 'raise'; raise?: number }; key: string }[] = [];
    if (decision.canFold) list.push({ label: 'Fold', choice: { move: 'fold' }, key: 'F' });
    if (decision.canCheck) list.push({ label: 'Check', choice: { move: 'check' }, key: 'C' });
    for (const raise of [...decision.raises].sort((a, b) => a - b)) {
      list.push({ label: `Bet ${raise}×`, choice: { move: 'raise', raise }, key: String(raise) });
    }
    return list.map((o) => ({
      ...o,
      suggested:
        o.choice.move === suggestion.move && (o.choice.move !== 'raise' || o.choice.raise === suggestion.raise),
    }));
  });

  const STREET_HINT = {
    preflop: 'Bet big now, or wait and see the flop',
    flop: 'Bet 2× now, or see the last two cards',
    river: 'Bet 1× to stay in, or fold',
  } as const;

  function begin() {
    unlockAudio();
    game.start();
  }

  function onKey(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('input, select, textarea, dialog')) return;
    const key = e.key.toUpperCase();
    const option = options.find((o) => o.key === key);
    if (option && seq.awaiting === 'move') return game.choose(option.choice);
    if (e.key !== ' ' && e.key !== 'Enter') return;
    if (target.closest('button, a')) return;
    e.preventDefault();
    game.advance();
  }

  const partNet = (part: 'ante' | 'blind' | 'play' | 'trips') => game.results[part]?.net;
</script>

<svelte:window onkeydown={onKey} />
<UthRules bind:this={rules} rules={game.rules} />

<TableShell
  title={['Ultimate', "Texas Hold'em"]}
  bank={game.bank}
  {seq}
  autoPlay={game.autoPlay}
  onAuto={(on) => game.setAutoPlay(on)}
  {muted}
  onMute={(m) => (muted = m)}
  onRules={() => rules?.open()}
  {onExit}
  onTapFelt={() => seq.awaiting === 'deal' && game.deal()}
>
  {#snippet felt()}
    <div class="layout">
      <div class="dealer-area">
        <CardRow title="Dealer" cards={game.dealer} side="dealer" {flipMs}>
          {#snippet badge()}
            {#if game.dealerHand}
              <span class="hand-name">{CATEGORY_NAMES[game.dealerHand.category]}</span>
              <span class="tag" class:muted={!game.dealerQualified}>
                {game.dealerQualified ? 'Opens' : 'Does not open'}
              </span>
            {/if}
          {/snippet}
        </CardRow>
      </div>

      <div class="board-area">
        <CardRow cards={game.board} side="board" {flipMs} highlight={game.net !== null ? game.playerBest : undefined} />
      </div>

      <ul class="bets" aria-label="Your bets">
        {#each [['ante', 1], ['blind', 1], ['play', game.play], ['trips', game.tripsUnits]] as const as [part, units] (part)}
          {@const net = partNet(part)}
          <li class:empty={units === 0} class:win={(net ?? 0) > 0} class:loss={(net ?? 0) < 0}>
            <span class="name">{part}</span>
            <b>
              {units > 0 ? formatMoney(game.roundAnte.mul(units)) : part === 'play' ? (game.folded ? 'folded' : '—') : 'off'}
            </b>
            {#if net !== undefined && units > 0}
              <small>{net === 0 ? 'push' : formatMoney(game.roundAnte.mul(net), true)}</small>
            {/if}
          </li>
        {/each}
      </ul>

      <div class="player-area">
        <CardRow
          title="You"
          cards={game.hole}
          side="player"
          {flipMs}
          highlight={game.net !== null ? game.playerBest : undefined}
        >
          {#snippet badge()}
            {#if game.playerHand}<span class="hand-name">{CATEGORY_NAMES[game.playerHand.category]}</span>{/if}
          {/snippet}
        </CardRow>
      </div>

      <div class="result">
        {#if game.net !== null}
          <p class="banner" class:win={game.net > 0} class:loss={game.net < 0} class:big={game.net >= 6}>
            {game.folded ? 'Folded' : game.net > 0 ? 'You win' : game.net < 0 ? 'Dealer wins' : 'Push'}
            <b>{formatMoney(game.roundAnte.mul(game.net), true)}</b>
          </p>
        {/if}
      </div>
    </div>

    {#if !game.started}
      <div class="overlay">
        <p>Two cards each, five on the board. Bet big early on a strong hand, or wait and pay less to see more.</p>
        <button type="button" class="primary" onclick={begin}>Take a seat</button>
        <button type="button" onclick={() => rules?.open()}>How to play</button>
      </div>
    {:else if game.gameOver}
      <div class="overlay">
        <h2>Busted</h2>
        <p>{game.hands} hands · biggest win {formatMoney(game.biggestWin)}</p>
        <button type="button" class="primary" onclick={() => game.restart()}>Buy back in</button>
      </div>
    {/if}
  {/snippet}

  {#snippet action()}
    <div class="bar">
      {#if seq.awaiting === 'move' && pending}
        <div class="choice" role="group" aria-label="Your move">
          {#each options as option (option.label)}
            <button
              type="button"
              class="act"
              class:suggested={option.suggested}
              onclick={() => game.choose(option.choice)}
            >
              {option.label}
              {#if option.choice.raise}<small>{formatMoney(game.roundAnte.mul(option.choice.raise))}</small>{/if}
              <kbd>{option.key}</kbd>
            </button>
          {/each}
        </div>
        <p class="hint">
          {#if pending.odds}
            The dealer beats you {Math.round(pending.odds.beats * 100)}% of the time
          {:else}
            {STREET_HINT[pending.decision.street]}
          {/if}
        </p>
      {:else if seq.awaiting === 'deal'}
        <button type="button" class="act primary" onclick={() => game.deal()}>Deal</button>
      {:else if game.started && !game.gameOver}
        <p class="hint">{game.autoPlay ? `Auto playing · ${seq.speed}` : 'Dealing…'}</p>
        {#if game.autoPlay}
          <button type="button" onclick={() => seq.togglePause()}>{seq.paused ? 'Resume' : 'Pause'}</button>
        {/if}
      {/if}
    </div>
  {/snippet}

  {#snippet panels()}
    <UthPanels {game} {muted} onMuteChange={(m) => (muted = m)} />
  {/snippet}
</TableShell>

<style>
  .layout {
    display: grid;
    gap: inherit;
    grid-template-areas: 'dealer' 'board' 'bets' 'player' 'result';
  }
  .dealer-area {
    grid-area: dealer;
  }
  .board-area {
    grid-area: board;
  }
  .bets {
    grid-area: bets;
  }
  .player-area {
    grid-area: player;
  }
  .result {
    grid-area: result;
  }
  /* Landscape phones are short: dealer and player sit side by side. */
  @media (orientation: landscape) and (max-height: 520px) {
    .layout {
      grid-template-columns: 1fr 1fr;
      grid-template-areas:
        'dealer player'
        'board board'
        'bets result';
      align-items: center;
    }
    .bets li {
      min-width: 54px;
      padding: 3px 6px;
    }
  }
  .hand-name {
    font: 700 15px/1 var(--font-display);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .tag {
    font: 700 10px/1 var(--font-ui);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 4px 8px;
    border-radius: 999px;
    background: var(--chip-bg);
  }
  .tag.muted {
    color: var(--win);
  }
  .bets {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
  }
  .bets li {
    display: grid;
    justify-items: center;
    gap: 2px;
    min-width: 66px;
    padding: 6px 10px;
    border-radius: 12px;
    border: 2px dashed var(--line);
  }
  .bets li.empty {
    opacity: 0.5;
  }
  .bets li.win {
    border-style: solid;
    border-color: var(--win);
  }
  .bets li.loss {
    border-style: solid;
    border-color: var(--loss);
  }
  .bets .name {
    font: 600 10px/1 var(--font-ui);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .bets b {
    font: 700 15px/1.1 var(--font-display);
    font-variant-numeric: tabular-nums;
  }
  .bets small {
    font: 600 11px/1 var(--font-ui);
    font-variant-numeric: tabular-nums;
  }
  .win small,
  .banner.win {
    color: var(--win);
  }
  .loss small,
  .banner.loss {
    color: var(--loss);
  }
  .result {
    min-height: 26px;
    display: grid;
    justify-items: center;
  }
  .banner {
    margin: 0;
    font: 700 18px/1 var(--font-display);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    animation: pop 300ms ease-out;
  }
  .banner.big {
    font-size: 24px;
    color: var(--gold);
    text-shadow: 0 0 18px var(--gold);
  }
  @keyframes pop {
    from {
      transform: scale(0.6);
      opacity: 0;
    }
  }
  .overlay {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 14px;
    padding: 16px;
    text-align: center;
    background: rgb(5 20 15 / 0.82);
  }
  .overlay h2 {
    margin: 0;
    font: 700 36px/1 var(--font-display);
    color: var(--loss);
    text-transform: uppercase;
  }
  .overlay p {
    margin: 0;
    max-width: 36ch;
    color: var(--muted);
  }

  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 8px 12px;
    min-height: 58px;
    padding: 8px 12px calc(8px + env(safe-area-inset-bottom));
  }
  .choice {
    display: flex;
    gap: 8px;
    flex: 1 1 auto;
    justify-content: center;
    max-width: 560px;
  }
  .act {
    font: 600 15px/1 var(--font-display);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    padding: 12px 18px;
    min-height: 48px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }
  .choice .act {
    flex: 1 1 0;
  }
  .act small {
    font: 400 12px/1 var(--font-ui);
    color: var(--muted);
  }
  .act.suggested {
    border-color: var(--gold);
    box-shadow: 0 0 0 1px var(--gold);
  }
  .hint {
    margin: 0;
    font: 13px/1.3 var(--font-ui);
    color: var(--muted);
  }
  kbd {
    font: 600 10px/1 var(--font-ui);
    padding: 2px 4px;
    border: 1px solid var(--line);
    border-bottom-width: 2px;
    border-radius: 4px;
    color: var(--muted);
  }
  @media (pointer: coarse) {
    kbd {
      display: none;
    }
  }
</style>
