<script lang="ts">
  import { onDestroy } from 'svelte';
  import { DJ_CATEGORY_NAMES, djCategoryOf, DjCategory, djTopRank, isWild, type DjMove } from '@idlesuits/sim';
  import BetBar from '../../components/BetBar.svelte';
  import BetSpot from '../../components/BetSpot.svelte';
  import CardRow from '../../components/CardRow.svelte';
  import DecisionBar from '../../components/DecisionBar.svelte';
  import FeltBand from '../../components/FeltBand.svelte';
  import PayTable from '../../components/PayTable.svelte';
  import SeatOverlay from '../../components/SeatOverlay.svelte';
  import SideBetsPanel from '../../components/SideBetsPanel.svelte';
  import TablePanels from '../../components/TablePanels.svelte';
  import TableShell from '../../components/TableShell.svelte';
  import { heldValue } from '../../lib/betting.svelte';
  import type { GameProps } from '../../lib/games';
  import { Decimal, formatMoney } from '../../lib/money';
  import { setMuted, sfx, unlockAudio } from '../../lib/sound';
  import { spotView } from '../../lib/stakes.svelte';
  import { handPhrase, showdownLine } from '../../lib/verdict';
  import DjRules from './DjRules.svelte';
  import { DjGame } from './game.svelte';

  let { onExit }: GameProps = $props();

  const game = new DjGame();
  const seq = game.seq;
  onDestroy(() => game.dispose());

  let muted = $state(false);
  let rules = $state<DjRules>();
  $effect(() => setMuted(muted));

  const FLIP_MS = { smart: 280, '1x': 300, '2x': 190, '5x': 90 } as const;
  const flipMs = $derived(FLIP_MS[seq.speed]);

  const options = $derived(
    game.suggestion === null
      ? []
      : ([
          ['Fold', 'fold', 'F'],
          ['Play 2×', 'play', 'P'],
        ] as const).map(([label, move, key]) => ({
          label,
          key,
          sub: move === 'play' ? formatMoney(game.roundAnte.mul(game.rules.play)) : undefined,
          suggested: move === game.suggestion,
          pick: () => game.choose(move as DjMove),
        })),
  );

  // The spots on the felt.
  const betting = $derived(seq.awaiting === 'deal' && (game.bets.touched || game.hands === 0));
  const ante = $derived(spotView(betting, game.roundAnte, 1, game.ante, game.results.ante?.net));
  const blind = $derived(spotView(betting, game.roundAnte, 1, game.ante, game.results.blind?.net));
  const play = $derived(
    spotView(betting, game.roundAnte, game.played ? game.rules.play : 0, new Decimal(0), game.results.play?.net),
  );
  const sideView = (id: string) =>
    spotView(betting, game.roundAnte, game.roundSide[id] ?? 0, game.side.amount(id), game.bonusResults[id]?.net);
  const trips = $derived(sideView('trips'));
  const badBeat = $derived(sideView('badBeat'));

  const RANK_WORDS: Record<number, [string, string]> = {
    11: ['Jack', 'jacks'],
    12: ['Queen', 'queens'],
    13: ['King', 'kings'],
    14: ['Ace', 'aces'],
  };
  /** "Pair of jacks", "King high", "Five of a kind". */
  function djName(score: number | null): string {
    if (score === null) return '';
    const category = djCategoryOf(score);
    const top = djTopRank(score);
    if (category === DjCategory.Pair) return `Pair of ${RANK_WORDS[top]?.[1] ?? `${top}s`}`;
    if (category === DjCategory.HighCard) return `${RANK_WORDS[top]?.[0] ?? top} high`;
    return DJ_CATEGORY_NAMES[category];
  }

  function placeAnte() {
    if (game.bets.addMain(heldValue(game.bank))) sfx.chip();
  }

  const result = $derived.by(() => {
    if (game.net === null || betting || game.playerScore === null || game.dealerScore === null) return null;
    const net = game.roundAnte.mul(game.net);
    const you = { name: djName(game.playerScore), score: game.playerScore };
    const them = { name: djName(game.dealerScore), score: game.dealerScore };
    if (game.folded) return { title: 'Folded', net, detail: `You folded ${handPhrase(you.name)}`, big: false };
    const title = you.score > them.score ? 'You win' : you.score < them.score ? 'Dealer wins' : 'Push';
    return { title, net, detail: showdownLine(you, them), big: game.net >= 10 };
  });

  const BLIND_ROWS = $derived(
    Object.entries(game.rules.blindPays)
      .map(([c, pays]) => ({ category: Number(c) as DjCategory, pays: pays! }))
      .sort((a, b) => b.category - a.category)
      .map(({ category, pays }) => ({ label: DJ_CATEGORY_NAMES[category], pays: `${pays}:1` }))
      .concat({ label: 'Three of a kind or less', pays: 'push' }),
  );
  const blindLit = $derived.by(() => {
    const result = game.results.blind;
    if (!result || result.net < 0 || game.playerScore === null || game.folded) return undefined;
    const category = djCategoryOf(game.playerScore);
    return category <= DjCategory.Trips ? 'Three of a kind or less' : DJ_CATEGORY_NAMES[category];
  });

  function begin() {
    unlockAudio();
    game.start();
  }

  function onKey(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('input, select, textarea, dialog')) return;
    const option = options.find((o) => o.key === e.key.toUpperCase());
    if (option && seq.awaiting === 'move') return option.pick();
    if (e.key !== ' ' && e.key !== 'Enter') return;
    if (target.closest('button, a')) return;
    e.preventDefault();
    game.advance();
  }
</script>

<svelte:window onkeydown={onKey} />
<DjRules bind:this={rules} rules={game.rules} />

<TableShell
  title={['DJ', 'Wild']}
  bank={game.bank}
  {seq}
  autoPlay={game.autoPlay}
  onAuto={(on) => game.setAutoPlay(on)}
  {muted}
  onMute={(m) => (muted = m)}
  onRules={() => rules?.open()}
  {onExit}
  onTapFelt={() => seq.awaiting === 'deal' && game.deal()}
  cards={{ across: 5, rows: 2, reserve: 236 }}
>
  {#snippet felt()}
    <div class="layout">
      <div class="area dealer">
        <CardRow
          title="Dealer"
          cards={game.dealer}
          side="dealer"
          {flipMs}
          deal={game.deals}
          dealOrder={1}
          focus={game.dealerFocus}
          wild={isWild}
        >
          {#snippet badge()}
            {#if game.dealerScore !== null}<span class="hand-name">{djName(game.dealerScore)}</span>{/if}
          {/snippet}
        </CardRow>
      </div>

      <FeltBand title="DJ Wild" lines={['Deuces and the joker are wild', 'Dealer always plays']} {result} />

      <div class="spots">
        <BetSpot
          label="Trips"
          shape="diamond"
          amount={trips.amount}
          net={trips.net}
          next={trips.next}
          onPlace={() => game.bets.addSide('trips', heldValue(game.bank)) && sfx.chip()}
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
          hint="2× Ante"
          amount={play.amount}
          net={play.net}
          active={seq.awaiting === 'move'}
        />
        <BetSpot
          label="Bad Beat"
          size="sm"
          amount={badBeat.amount}
          net={badBeat.net}
          next={badBeat.next}
          onPlace={() => game.bets.addSide('badBeat', heldValue(game.bank)) && sfx.chip()}
          onClear={() => game.bets.clearSide('badBeat')}
        />
      </div>

      <div class="area player">
        <CardRow title="You" cards={game.player} side="player" {flipMs} deal={game.deals} dealOrder={0} wild={isWild}>
          {#snippet badge()}
            {#if game.playerScore !== null}<span class="hand-name">{djName(game.playerScore)}</span>{/if}
          {/snippet}
        </CardRow>
      </div>
    </div>

    <SeatOverlay
      started={game.started}
      gameOver={game.gameOver}
      intro="Deuces and the joker are wild. Play 2× when you like your five cards — the Blind pays up to 1,000:1 on a win."
      hands={game.hands}
      biggestWin={game.biggestWin}
      onSeat={begin}
      onRules={() => rules?.open()}
      onRestart={() => game.restart()}
    />
  {/snippet}

  {#snippet action()}
    {#if seq.awaiting === 'move' && game.suggestion}
      <DecisionBar {options} hint="Play a pair of fours or better · folding loses Ante and Blind" />
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
    <TablePanels
      {seq}
      {muted}
      onMute={(m) => (muted = m)}
      seed={game.runSeed}
      round={game.round}
      onRestart={() => game.restart()}
      last={game.last}
      lastUnit={game.lastAnte}
      stats={[
        ['Hands', String(game.hands)],
        ['Folds', String(game.folds)],
        ['Biggest win', formatMoney(game.biggestWin)],
      ]}
      sessionNet={game.sessionNet}
      history={game.history.map((h) => ({ round: h.round, text: h.player, sub: `v ${h.dealer}`, net: h.net }))}
    >
      <section class="panel">
        <PayTable title="Blind pays (when you win)" rows={BLIND_ROWS} lit={blindLit} />
      </section>
      <SideBetsPanel stakes={game.side} results={game.bonusResults} />
    </TablePanels>
  {/snippet}
</TableShell>

{#snippet pause()}
  <button type="button" class="pause" onclick={() => seq.togglePause()}>{seq.paused ? 'Resume' : 'Pause'}</button>
{/snippet}

<style>
  .layout {
    display: grid;
    height: 100%;
    grid-template-rows: auto minmax(36px, 1fr) auto auto;
    grid-template-areas: 'dealer' 'band' 'spots' 'player';
    align-items: center;
    justify-items: center;
    gap: 6px;
  }
  .area {
    width: 100%;
  }
  .dealer {
    grid-area: dealer;
  }
  .player {
    grid-area: player;
  }
  .spots {
    grid-area: spots;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    gap: clamp(10px, 3cqw, 26px);
  }
  .pause {
    min-width: 108px;
    min-height: 44px;
  }
  .panel {
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--rail);
  }
  /* Landscape phones: the hands stacked on the left, the bets in a column on the right. */
  @media (orientation: landscape) and (max-height: 520px) {
    .layout {
      --card-w: clamp(30px, min(calc((100cqw - 200px) / 5.9), calc((100cqh - 84px) / 2.8)), 96px);
      position: relative;
      grid-template-columns: 1fr auto;
      grid-template-rows: 1fr 1fr;
      grid-template-areas:
        'dealer spots'
        'player spots';
      column-gap: 12px;
    }
    .spots {
      flex-wrap: wrap;
      width: 170px;
      align-content: center;
      row-gap: 4px;
    }
  }
</style>
