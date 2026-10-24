<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    C4P_BONUSES,
    FOUR_CARD_NAMES,
    fourCategoryOf,
    FourCategory,
    fourTopRank,
    type C4pChoice,
    type Card,
  } from '@idlesuits/sim';
  import Breakdown from '../../components/Breakdown.svelte';
  import CardRow from '../../components/CardRow.svelte';
  import PayTable from '../../components/PayTable.svelte';
  import SideBetsPanel from '../../components/SideBetsPanel.svelte';
  import TableShell from '../../components/TableShell.svelte';
  import type { GameProps } from '../../lib/games';
  import { formatMoney } from '../../lib/money';
  import { SPEEDS } from '../../lib/sequencer.svelte';
  import { setMuted, unlockAudio } from '../../lib/sound';
  import C4pRules from './C4pRules.svelte';
  import { C4pGame } from './game.svelte';

  let { onExit }: GameProps = $props();

  const game = new C4pGame();
  const seq = game.seq;
  onDestroy(() => game.dispose());

  let muted = $state(false);
  let rules = $state<C4pRules>();
  $effect(() => setMuted(muted));

  const FLIP_MS = { smart: 280, '1x': 300, '2x': 190, '5x': 90 } as const;
  const flipMs = $derived(FLIP_MS[seq.speed]);

  /** The moves on offer: fold, play 1×, and 3× only with a pair of aces or better. */
  const options = $derived(
    [
      { label: 'Fold', choice: { move: 'fold' } as C4pChoice, key: 'F' },
      ...game.sizes.map((size) => ({ label: `Play ${size}×`, choice: { move: 'play', size } as C4pChoice, key: String(size) })),
    ].map((o) => ({
      ...o,
      suggested:
        !!game.suggestion &&
        o.choice.move === game.suggestion.move &&
        (o.choice.move === 'fold' || (game.suggestion.move === 'play' && o.choice.size === game.suggestion.size)),
    })),
  );

  const RANK_WORDS: Record<number, [string, string]> = {
    11: ['Jack', 'jacks'],
    12: ['Queen', 'queens'],
    13: ['King', 'kings'],
    14: ['Ace', 'aces'],
  };
  /** A best-four hand by name: "Pair of aces", "King high", "Flush". */
  function fourName(score: number | null): string {
    if (score === null) return '';
    const category = fourCategoryOf(score);
    const top = fourTopRank(score);
    if (category === FourCategory.Pair) return `Pair of ${RANK_WORDS[top]?.[1] ?? `${top}s`}`;
    if (category === FourCategory.HighCard) return `${RANK_WORDS[top]?.[0] ?? top} high`;
    if (category === FourCategory.Quads && top === 14) return 'Four aces';
    return FOUR_CARD_NAMES[category];
  }

  /** The four cards that play, lifted; the fifth is dimmed once the hand is decided. */
  const keep = (cards: (Card | null)[], discard: number) =>
    discard < 0 ? undefined : new Set(cards.filter((c, i): c is Card => c !== null && i !== discard).map((c) => c.uid));

  const SUPER_ROWS = $derived([
    { label: 'Four aces', pays: `${game.rules.superBonus.fourAces}:1` },
    { label: 'Four of a kind', pays: `${game.rules.superBonus.quads}:1` },
    { label: 'Straight flush', pays: `${game.rules.superBonus.straightFlush}:1` },
    { label: 'Three of a kind', pays: `${game.rules.superBonus.trips}:1` },
    { label: 'Flush', pays: '3:2' },
    { label: 'Straight', pays: `${game.rules.superBonus.straight}:1` },
  ]);
  const superLit = $derived(
    game.results.superBonus && game.results.superBonus.net > 0 && game.playerScore !== null
      ? fourName(game.playerScore)
      : undefined,
  );

  const sideSpots = $derived(
    C4P_BONUSES.filter((b) => (game.roundSide[b.id] ?? 0) > 0).map((b) => ({
      bet: b,
      units: game.roundSide[b.id]!,
      result: game.bonusResults[b.id],
    })),
  );

  function begin() {
    unlockAudio();
    game.start();
  }

  function onKey(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('input, select, textarea, dialog')) return;
    const option = options.find((o) => o.key === e.key.toUpperCase());
    if (option && seq.awaiting === 'move') return game.choose(option.choice);
    if (e.key !== ' ' && e.key !== 'Enter') return;
    if (target.closest('button, a')) return;
    e.preventDefault();
    game.advance();
  }
</script>

<svelte:window onkeydown={onKey} />
<C4pRules bind:this={rules} rules={game.rules} />

<TableShell
  title={['Crazy 4', 'Poker']}
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
        <CardRow
          title="Dealer"
          cards={game.dealer}
          side="dealer"
          {flipMs}
          highlight={keep(game.dealer, game.dealerDiscard)}
        >
          {#snippet badge()}
            {#if game.dealerScore !== null}
              <span class="hand-name">{fourName(game.dealerScore)}</span>
              <span class="tag" class:muted={!game.opens}>{game.opens ? 'Opens' : 'Does not open'}</span>
            {/if}
          {/snippet}
        </CardRow>
      </div>

      <ul class="bets" aria-label="Your bets">
        {#each [['ante', 1, 'Ante'], ['superBonus', 1, 'Super'], ['play', game.play, 'Play']] as const as [part, units, name] (part)}
          {@const net = game.results[part]?.net}
          <li class:placed={units > 0} class:win={(net ?? 0) > 0} class:loss={(net ?? 0) < 0}>
            <span class="name">{name}</span>
            <b>{units > 0 ? formatMoney(game.roundAnte.mul(units)) : game.folded ? 'folded' : '—'}</b>
            {#if net !== undefined && units > 0}
              <small class="result-net">{net === 0 ? 'push' : formatMoney(game.roundAnte.mul(net), true)}</small>
            {/if}
          </li>
        {/each}
        {#each sideSpots as spot (spot.bet.id)}
          {@const net = spot.result?.net}
          <li class="placed side" class:win={(net ?? 0) > 0} class:loss={(net ?? 0) < 0}>
            <span class="name">{spot.bet.short}</span>
            <b>{formatMoney(game.roundAnte.mul(spot.units))}</b>
            {#if net !== undefined}<small class="result-net">{formatMoney(game.roundAnte.mul(net), true)}</small>{/if}
          </li>
        {/each}
      </ul>

      <div class="player-area">
        <CardRow
          title="You"
          cards={game.player}
          side="player"
          {flipMs}
          highlight={keep(game.player, game.playerDiscard)}
        >
          {#snippet badge()}
            {#if game.playerScore !== null}<span class="hand-name">{fourName(game.playerScore)}</span>{/if}
          {/snippet}
        </CardRow>
      </div>

      <div class="result">
        {#if game.net !== null}
          <p class="banner" class:win={game.net > 0} class:loss={game.net < 0} class:big={game.net >= 10}>
            {game.folded ? 'Folded' : game.net > 0 ? 'You win' : game.net < 0 ? 'Dealer wins' : 'Push'}
            <b>{formatMoney(game.roundAnte.mul(game.net), true)}</b>
          </p>
        {/if}
      </div>
    </div>

    {#if !game.started}
      <div class="overlay">
        <p>Five cards each; your best four play. Play 3× with aces or better, and the Super Bonus pays on any straight or better.</p>
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
      {#if seq.awaiting === 'move' && game.suggestion}
        <div class="choice" role="group" aria-label="Your move">
          {#each options as option (option.label)}
            <button
              type="button"
              class="act"
              class:suggested={option.suggested}
              onclick={() => game.choose(option.choice)}
            >
              {option.label}
              {#if option.choice.move === 'play'}<small>{formatMoney(game.roundAnte.mul(option.choice.size))}</small>{/if}
              <kbd>{option.key}</kbd>
            </button>
          {/each}
        </div>
        <p class="hint">Play K-Q-8-4 or better; 3× with aces or better · folding loses Ante and Super Bonus</p>
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
    <section class="panel">
      <h2>Bet <span>applies to the next hand</span></h2>
      <div class="row">
        <span>Ante</span>
        <span class="stepper">
          <button type="button" onclick={() => game.changeAnte(0.5)} aria-label="Halve ante">−</button>
          <b>{formatMoney(game.ante)}</b>
          <button type="button" onclick={() => game.changeAnte(2)} aria-label="Double ante">+</button>
        </span>
      </div>
      <p class="note">
        The Super Bonus is a second bet the size of the ante. Max at risk:
        {formatMoney(game.ante.mul(2 + game.rules.bigPlay).add(game.side.total))}.
      </p>
    </section>

    <section class="panel">
      <PayTable title="Super Bonus (straight or better, win or lose)" rows={SUPER_ROWS} lit={superLit} />
    </section>

    <SideBetsPanel stakes={game.side} base={game.ante} results={game.bonusResults} />

    <section class="panel">
      <h2>Last hand</h2>
      <Breakdown lines={game.last?.lines ?? []} net={game.last?.net ?? null} ante={game.lastAnte} />
    </section>

    <section class="panel">
      <h2>Session</h2>
      <dl>
        <dt>Hands</dt>
        <dd>{game.hands}</dd>
        <dt>Net</dt>
        <dd class:win={game.sessionNet.gt(0)} class:loss={game.sessionNet.lt(0)}>{formatMoney(game.sessionNet, true)}</dd>
        <dt>Biggest win</dt>
        <dd>{formatMoney(game.biggestWin)}</dd>
        <dt>Folds</dt>
        <dd>{game.folds}</dd>
      </dl>
      <ol class="history">
        {#each game.history as h (h.round)}
          <li>
            <span class="muted">#{h.round}</span>
            <span>{h.player}</span>
            <span class="muted">v {h.dealer}</span>
            <span class:win={h.net.gt(0)} class:loss={h.net.lt(0)}>{formatMoney(h.net, true)}</span>
          </li>
        {/each}
      </ol>
    </section>

    <section class="panel">
      <h2>Table</h2>
      <div class="speed" role="group" aria-label="Deal speed">
        {#each SPEEDS as s (s)}
          <button type="button" aria-pressed={seq.speed === s} onclick={() => (seq.speed = s)}>{s}</button>
        {/each}
      </div>
      <label class="switch">
        <input type="checkbox" checked={muted} onchange={(e) => (muted = e.currentTarget.checked)} />
        Mute sound
      </label>
      <p class="muted small">Seed {game.runSeed} · hand {game.round}</p>
      <button type="button" onclick={() => game.restart()}>Restart</button>
    </section>
  {/snippet}
</TableShell>

<style>
  .layout {
    display: grid;
    gap: inherit;
    grid-template-areas: 'dealer' 'bets' 'player' 'result';
  }
  .dealer-area {
    grid-area: dealer;
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
  /* Landscape phones are short: the dealer's cards and the player's sit side by side. */
  @media (orientation: landscape) and (max-height: 520px) {
    .layout {
      grid-template-columns: 1fr 1fr;
      grid-template-areas:
        'dealer player'
        'bets bets'
        'result result';
      align-items: center;
    }
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
  .hand-name {
    font: 700 15px/1 var(--font-display);
    text-transform: uppercase;
    letter-spacing: 0.03em;
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
    min-width: 62px;
    min-height: 54px;
    padding: 6px 10px;
    border-radius: 12px;
    border: 2px dashed var(--line);
    opacity: 0.55;
  }
  .bets li.placed {
    opacity: 1;
    border-style: solid;
    border-color: var(--gold);
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
    color: var(--gold);
  }
  .bets li.side {
    border-style: dashed;
  }
  .bets li.win {
    border-style: solid;
    border-color: var(--win);
  }
  .bets li.loss {
    border-style: solid;
    border-color: var(--loss);
  }
  .bets .win .result-net {
    color: var(--win);
  }
  .bets .loss .result-net {
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
    text-align: center;
    animation: pop 300ms ease-out;
  }
  .banner.win {
    color: var(--win);
  }
  .banner.loss {
    color: var(--loss);
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
    max-width: 520px;
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
  /* Short landscape puts the action bar in a narrow side column: stack the choices. */
  @media (orientation: landscape) and (max-height: 520px) {
    .bar,
    .choice {
      flex-direction: column;
      align-items: stretch;
    }
    .choice {
      flex: 0 0 auto;
    }
    .hint {
      text-align: center;
    }
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

  .panel {
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--rail);
    display: grid;
    gap: 10px;
  }
  .panel h2 {
    margin: 0;
    font: 600 11px/1 var(--font-ui);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
  .panel h2 span {
    letter-spacing: 0;
    text-transform: none;
    font-weight: 400;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font: 13px/1.3 var(--font-ui);
  }
  .stepper {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .stepper button {
    width: 36px;
    height: 36px;
    padding: 0;
    font-size: 16px;
  }
  .stepper b {
    min-width: 56px;
    text-align: center;
    font: 700 15px/1 var(--font-display);
    font-variant-numeric: tabular-nums;
  }
  .note {
    margin: 0;
    font: 12px/1.4 var(--font-ui);
    color: var(--muted);
  }
  dl {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 4px 12px;
    margin: 0;
    font: 13px/1.4 var(--font-ui);
  }
  dd {
    margin: 0;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .history {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 3px;
    font: 12px/1.4 var(--font-ui);
  }
  .history li {
    display: grid;
    grid-template-columns: 36px 1fr auto auto;
    gap: 8px;
    font-variant-numeric: tabular-nums;
  }
  .speed {
    display: flex;
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
    width: fit-content;
  }
  .speed button {
    border: 0;
    border-radius: 0;
    text-transform: capitalize;
  }
  .speed button[aria-pressed='true'] {
    background: var(--gold);
    color: var(--felt-deep);
  }
  .small {
    font-size: 12px;
    margin: 0;
  }
  .muted {
    color: var(--muted);
  }
  .win {
    color: var(--win);
  }
  .loss {
    color: var(--loss);
  }
</style>
