<script lang="ts">
  import { onDestroy } from 'svelte';
  import { handName, rankLabel, SUIT_SYMBOL, UTH_BONUSES } from '@idlesuits/sim';
  import BetBar from '../../components/BetBar.svelte';
  import BetSpot from '../../components/BetSpot.svelte';
  import CardRow from '../../components/CardRow.svelte';
  import FeltPrint from '../../components/FeltPrint.svelte';
  import ResultBanner from '../../components/ResultBanner.svelte';
  import TableShell from '../../components/TableShell.svelte';
  import { heldValue } from '../../lib/betting.svelte';
  import type { GameProps } from '../../lib/games';
  import { Decimal, formatMoney } from '../../lib/money';
  import { setMuted, sfx, unlockAudio } from '../../lib/sound';
  import { UthGame } from './game.svelte';
  import UthPanels from './UthPanels.svelte';
  import UthRules from './UthRules.svelte';
  import { handPhrase, showdownLine } from '../../lib/verdict';

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

  // ---------------------------------------------------------------------------
  // The spots on the felt. Between hands, once the player touches the chips,
  // they show the next bet; otherwise they show this hand and how it settled.

  const betting = $derived(seq.awaiting === 'deal' && (game.bets.touched || game.hands === 0));
  const zero = new Decimal(0);

  function view(roundUnits: number, next: Decimal, netUnits: number | undefined) {
    if (betting) return { amount: next, net: null, next: null };
    const amount = game.roundAnte.mul(roundUnits);
    return { amount, net: netUnits === undefined ? null : game.roundAnte.mul(netUnits), next };
  }

  const ante = $derived(view(1, game.ante, game.results.ante?.net));
  const blind = $derived(view(1, game.ante, game.results.blind?.net));
  const play = $derived(view(game.play, zero, game.play > 0 ? game.results.play?.net : undefined));
  const sides = $derived(
    UTH_BONUSES.map((bet) => ({
      bet,
      ...view(game.roundSide[bet.id] ?? 0, game.side.amount(bet.id), game.bonusResults[bet.id]?.net),
    })),
  );

  function placeAnte() {
    if (game.bets.addMain(heldValue(game.bank))) sfx.chip();
  }
  function placeSide(id: string) {
    if (game.bets.addSide(id, heldValue(game.bank))) sfx.chip();
  }

  // ---------------------------------------------------------------------------

  const result = $derived.by(() => {
    if (game.net === null || betting) return null;
    const net = game.roundAnte.mul(game.net);
    const you = { name: game.playerHand ? handName(game.playerHand) : '', score: game.playerHand?.score ?? 0 };
    const them = { name: game.dealerHand ? handName(game.dealerHand) : '', score: game.dealerHand?.score ?? 0 };
    const title = game.folded ? 'Folded' : you.score > them.score ? 'You win' : you.score < them.score ? 'Dealer wins' : 'Push';
    let detail = game.folded ? `The dealer had ${handPhrase(them.name)}` : showdownLine(you, them);
    if (title === 'You win' && !game.dealerQualified) detail += ' · dealer does not open';
    return { title, net, detail, big: game.net >= 10 };
  });

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
  cards={{ across: 5, rows: 3, reserve: 266 }}
>
  {#snippet felt()}
    <div class="layout">
      <div class="area-dealer"><CardRow
        title="Dealer"
        cards={game.dealer}
        side="dealer"
        {flipMs}
        deal={game.deals}
        dealOrder={1}
        focus={game.dealerFocus}
      >
        {#snippet badge()}
          {#if game.dealerHand}
            <span class="hand-name">{handName(game.dealerHand)}</span>
            <span class="hand-tag" class:good={!game.dealerQualified}>{game.dealerQualified ? 'Opens' : 'Does not open'}</span>
          {/if}
        {/snippet}
      </CardRow></div>

      <div class="area-board"><CardRow
        cards={game.board}
        side="board"
        {flipMs}
        deal={game.deals}
        dealOrder={2}
        highlight={game.net !== null ? game.playerBest : undefined}
      /></div>

      <div class="spots">
        <div class="main-spots">
          <BetSpot
            label="Trips"
            size="md"
            shape="diamond"
            amount={sides[0]!.amount}
            net={sides[0]!.net}
            next={sides[0]!.next}
            onPlace={() => placeSide('trips')}
            onClear={() => game.bets.clearSide('trips')}
          />
          <BetSpot
            label="Ante"
            size="lg"
            amount={ante.amount}
            net={ante.net}
            next={ante.next}
            onPlace={placeAnte}
            onClear={() => game.bets.clearMain()}
          />
          <BetSpot label="Blind" size="lg" hint="= Ante" amount={blind.amount} net={blind.net} next={blind.next} />
          <BetSpot
            label="Play"
            size="lg"
            hint="4× 2× 1×"
            amount={play.amount}
            net={play.net}
            active={seq.awaiting === 'move'}
          />
        </div>
        <div class="side-spots">
          {#each sides.slice(1) as side (side.bet.id)}
            <BetSpot
              label={side.bet.short}
              size="sm"
              amount={side.amount}
              net={side.net}
              next={side.next}
              onPlace={() => placeSide(side.bet.id)}
              onClear={() => game.bets.clearSide(side.bet.id)}
            />
          {/each}
        </div>
        <p class="bonus-cards">
          {#if game.bonusCards.length}
            <span class="bonus-label">6-Card Bonus</span>
            {#each game.bonusCards as card (card.uid)}
              <span class="pc" class:red={card.suit === 'H' || card.suit === 'D'}>{rankLabel(card.rank)}{SUIT_SYMBOL[card.suit]}</span>
            {/each}
          {/if}
        </p>
      </div>

      <!-- The open felt between the bets and your cards: the printed name, and where results show. -->
      <div class="band">
        <FeltPrint title="Ultimate Texas Hold'em" lines={['Dealer needs a pair to open', 'Blind pays on a straight or better']} />
        {#if result}
          <ResultBanner title={result.title} net={result.net} detail={result.detail} big={result.big} />
        {/if}
      </div>

      <div class="area-player"><CardRow
        title="You"
        cards={game.hole}
        side="player"
        {flipMs}
        deal={game.deals}
        dealOrder={0}
        highlight={game.net !== null ? game.playerBest : undefined}
      >
        {#snippet badge()}
          {#if game.playerHand}<span class="hand-name">{handName(game.playerHand)}</span>{/if}
        {/snippet}
      </CardRow></div>
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
    {#if seq.awaiting === 'move' && pending}
      <div class="bar">
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
      </div>
    {:else}
      <BetBar
        bank={game.bank}
        total={game.bets.total}
        canDeal={seq.awaiting === 'deal' && game.bets.canDeal}
        onDeal={() => game.deal()}
        onClear={() => game.bets.clearAll()}
        onDouble={() => game.bets.double()}
        trailing={game.autoPlay && game.started ? pause : undefined}
      />
    {/if}
  {/snippet}

  {#snippet panels()}
    <UthPanels {game} {muted} onMuteChange={(m) => (muted = m)} />
  {/snippet}
</TableShell>

{#snippet pause()}
  <button type="button" class="pause" onclick={() => seq.togglePause()}>{seq.paused ? 'Resume' : 'Pause'}</button>
{/snippet}

<style>
  .layout {
    display: grid;
    height: 100%;
    grid-template-rows: auto auto auto minmax(36px, 1fr) auto;
    grid-template-areas: 'dealer' 'board' 'spots' 'band' 'player';
    align-items: center;
    justify-items: center;
    gap: 4px;
  }
  .area-dealer,
  .area-board,
  .area-player {
    width: 100%;
  }
  .area-dealer {
    grid-area: dealer;
  }
  .area-board {
    grid-area: board;
  }
  .spots {
    grid-area: spots;
  }
  .band {
    grid-area: band;
  }
  .area-player {
    grid-area: player;
  }
  /*
   * Landscape phones: the dealer and your hand side by side over the board,
   * and the betting spots in a column of their own, so the cards stay large.
   */
  @media (orientation: landscape) and (max-height: 520px) {
    .layout {
      --card-w: clamp(30px, min(calc((100cqw - 250px) / 5.9), calc((100cqh - 96px) / 2.8)), 90px);
      grid-template-columns: 1fr 1fr auto;
      grid-template-rows: auto auto;
      grid-template-areas:
        'dealer player spots'
        'board board spots';
      align-content: center;
      column-gap: 10px;
    }
    .main-spots {
      flex-wrap: wrap;
      width: 190px;
      row-gap: 2px;
    }
    .layout {
      position: relative;
    }
    .layout .band {
      position: absolute;
      grid-area: auto;
      inset: 0;
      width: auto;
      pointer-events: none;
    }
    .band :global(.print),
    .bonus-label {
      display: none;
    }
  }
  .band {
    position: relative;
    align-self: stretch;
    width: 100%;
    min-height: 0;
    display: grid;
    align-items: center;
  }
  .spots {
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 2px;
  }
  .main-spots {
    display: flex;
    align-items: flex-end;
    justify-content: center;
    gap: clamp(8px, 2.6cqw, 22px);
  }
  .side-spots {
    display: flex;
    justify-content: center;
    gap: clamp(10px, 4cqw, 30px);
  }
  .bonus-cards {
    margin: 0;
    height: 18px;
    display: flex;
    align-items: center;
    gap: 4px;
    font: 600 10px/1 var(--font-ui);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .pc {
    padding: 2px 4px;
    border-radius: 3px;
    background: var(--card-face);
    color: var(--card-black);
    font: 700 12px/1 var(--font-display);
    letter-spacing: 0;
  }
  .pc.red {
    color: var(--card-red);
  }
  .overlay {
    position: absolute;
    inset: 0;
    z-index: 4;
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
    height: 17px;
    font: 13px/17px var(--font-ui);
    color: var(--muted);
    white-space: nowrap;
  }
  .pause {
    min-width: 108px;
    min-height: 44px;
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
      white-space: normal;
      height: auto;
    }
  }
</style>
