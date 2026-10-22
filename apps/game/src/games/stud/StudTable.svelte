<script lang="ts">
  import { onDestroy } from 'svelte';
  import { CATEGORY_NAMES, type StudChoice } from '@idlesuits/sim';
  import Breakdown from '../../components/Breakdown.svelte';
  import CardRow from '../../components/CardRow.svelte';
  import PayTable from '../../components/PayTable.svelte';
  import TableShell from '../../components/TableShell.svelte';
  import type { GameProps } from '../../lib/games';
  import { formatMoney } from '../../lib/money';
  import { SPEEDS } from '../../lib/sequencer.svelte';
  import { setMuted, unlockAudio } from '../../lib/sound';
  import { StudGame } from './game.svelte';
  import StudRules from './StudRules.svelte';

  let { onExit }: GameProps = $props();

  const game = new StudGame();
  const seq = game.seq;
  onDestroy(() => game.dispose());

  let muted = $state(false);
  let rules = $state<StudRules>();
  $effect(() => setMuted(muted));

  const FLIP_MS = { smart: 280, '1x': 300, '2x': 190, '5x': 90 } as const;
  const flipMs = $derived(FLIP_MS[seq.speed]);
  const pending = $derived(game.pending);

  const OPTIONS: { label: string; choice: StudChoice; key: string }[] = [
    { label: 'Fold', choice: { move: 'fold' }, key: 'F' },
    { label: 'Bet 1×', choice: { move: 'bet', size: 1 }, key: '1' },
    { label: 'Bet 3×', choice: { move: 'bet', size: 3 }, key: '3' },
  ];
  const same = (a: StudChoice, b: StudChoice) =>
    a.move === b.move && (a.move === 'fold' || (b.move === 'bet' && a.size === b.size));

  const PAY_ROWS = [
    { label: 'Royal flush', pays: '500:1' },
    { label: 'Straight flush', pays: '100:1' },
    { label: 'Four of a kind', pays: '40:1' },
    { label: 'Full house', pays: '10:1' },
    { label: 'Flush', pays: '6:1' },
    { label: 'Straight', pays: '4:1' },
    { label: 'Three of a kind', pays: '3:1' },
    { label: 'Two pair', pays: '2:1' },
    { label: 'Jacks or better', pays: '1:1' },
    { label: 'Sixes to tens', pays: 'push' },
  ];

  /** Which pay table row the final hand landed on. */
  const lit = $derived.by(() => {
    if (!game.hand || game.multiplier === null) return undefined;
    if (game.hand.category === 1) {
      const pair = game.hand.madeRank ?? 0;
      return pair >= 11 ? 'Jacks or better' : pair >= 6 ? 'Sixes to tens' : undefined;
    }
    return game.multiplier >= 0 ? CATEGORY_NAMES[game.hand.category] : undefined;
  });

  function begin() {
    unlockAudio();
    game.start();
  }

  function onKey(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('input, select, textarea, dialog')) return;
    const option = OPTIONS.find((o) => o.key === e.key.toUpperCase());
    if (option && seq.awaiting === 'move') return game.choose(option.choice);
    if (e.key !== ' ' && e.key !== 'Enter') return;
    if (target.closest('button, a')) return;
    e.preventDefault();
    game.advance();
  }
</script>

<svelte:window onkeydown={onKey} />
<StudRules bind:this={rules} />

<TableShell
  title={['Mississippi', 'Stud']}
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
    <CardRow title="Community" cards={game.community} side="board" {flipMs} highlight={game.net !== null ? game.best : undefined} />

    <ul class="bets" aria-label="Your bets">
      <li class="placed">
        <span class="name">Ante</span>
        <b>{formatMoney(game.roundAnte)}</b>
      </li>
      {#each game.bets as bet, i (i)}
        <li class:placed={bet !== null} class:folded={game.folded && bet === null && i === game.bets.indexOf(null)}>
          <span class="name">{['3rd', '4th', '5th'][i]}</span>
          <b>{bet !== null ? formatMoney(game.roundAnte.mul(bet)) : game.folded ? '—' : ''}</b>
          {#if bet !== null}<small>{bet}×</small>{/if}
        </li>
      {/each}
    </ul>

    <CardRow title="You" cards={game.hole} side="player" {flipMs} highlight={game.net !== null ? game.best : undefined}>
      {#snippet badge()}
        {#if game.hand}<span class="hand-name">{CATEGORY_NAMES[game.hand.category]}</span>{/if}
      {/snippet}
    </CardRow>

    <div class="result">
      {#if game.net !== null}
        <p class="banner" class:win={game.net > 0} class:loss={game.net < 0} class:big={game.net >= 10}>
          {#if game.folded}
            Folded
          {:else if game.multiplier! > 0}
            Pays {game.multiplier}:1 on {game.wagered} units
          {:else if game.multiplier === 0}
            Push
          {:else}
            No pay
          {/if}
          <b>{formatMoney(game.roundAnte.mul(game.net), true)}</b>
        </p>
      {:else if game.started}
        <p class="stake">On the table: {formatMoney(game.roundAnte.mul(game.wagered))}</p>
      {/if}
    </div>

    {#if !game.started}
      <div class="overlay">
        <p>No dealer to beat — just a pay table. Raise as your hand improves, and every bet is paid at the same odds.</p>
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
          {#each OPTIONS as option (option.label)}
            <button
              type="button"
              class="act"
              class:suggested={same(option.choice, pending.suggestion)}
              onclick={() => game.choose(option.choice)}
            >
              {option.label}
              {#if option.choice.move === 'bet'}<small>{formatMoney(game.roundAnte.mul(option.choice.size))}</small>{/if}
              <kbd>{option.key}</kbd>
            </button>
          {/each}
        </div>
        <p class="hint">
          {pending.decision.street === 5 ? 'Last bet before the final card' : 'Bet to see the next card'} · folding loses
          {formatMoney(game.roundAnte.mul(game.wagered))}
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
      <p class="note">Each street adds 1× or 3× the ante. Max at risk: {formatMoney(game.ante.mul(10))}.</p>
    </section>

    <section class="panel">
      <PayTable title="Pays on every bet" rows={PAY_ROWS} {lit} />
    </section>

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
            <span>{h.hand}</span>
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
  .stake {
    margin: 0;
    font: 500 13px/1 var(--font-ui);
    color: var(--muted);
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
    grid-template-columns: 36px 1fr auto;
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
