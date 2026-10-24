<script lang="ts">
  import { onDestroy } from 'svelte';
  import { SUIT_SYMBOL } from '@idlesuits/sim';
  import BetBar from '../../components/BetBar.svelte';
  import BetSpot from '../../components/BetSpot.svelte';
  import DecisionBar from '../../components/DecisionBar.svelte';
  import FeltBand from '../../components/FeltBand.svelte';
  import SeatOverlay from '../../components/SeatOverlay.svelte';
  import TablePanels from '../../components/TablePanels.svelte';
  import TableShell from '../../components/TableShell.svelte';
  import { heldValue } from '../../lib/betting.svelte';
  import type { GameProps } from '../../lib/games';
  import { Decimal, formatMoney } from '../../lib/money';
  import { setMuted, sfx, unlockAudio } from '../../lib/sound';
  import { spotView } from '../../lib/stakes.svelte';
  import BetPanel from './BetPanel.svelte';
  import type { SpeedMode } from './director';
  import { Game } from './game.svelte';
  import HandRow from './HandRow.svelte';
  import RulesDialog from './RulesDialog.svelte';
  import SideBetTile from './SideBetTile.svelte';

  let { onExit }: GameProps = $props();

  const game = new Game();
  const view = game.view;
  onDestroy(() => game.dispose());

  const FLIP_MS: Record<SpeedMode, number> = { smart: 280, '1x': 320, '2x': 200, '5x': 90 };

  let muted = $state(false);
  let rulesDialog = $state<RulesDialog>();
  $effect(() => setMuted(muted));

  const flipMs = $derived(game.speed === 'smart' && view.drama === 'tense' ? 520 : FLIP_MS[game.speed]);

  const OUTCOME_TEXT: Record<string, string> = {
    win: 'You win',
    lose: 'Dealer wins',
    push: 'Push',
    fold: 'Folded',
    dealerNoQualify: 'You win',
  };

  // Re-estimate whenever a bet changes; debounced so clicking through steps stays cheap.
  $effect(() => {
    const key = JSON.stringify([
      game.ante.toString(),
      Object.entries(game.sideStakes).map(([id, s]) => [id, s.toString()]),
      game.raisePlan,
      game.dealerClaims,
    ]);
    const timer = setTimeout(() => key && game.refreshEstimate(), 250);
    return () => clearTimeout(timer);
  });

  // The spots on the felt.
  const betting = $derived(game.awaiting === 'deal' && (game.bets.touched || game.hands === 0));
  const settled = $derived(view.net !== null ? view.outcome : null);
  const ANTE_NET = { win: 1, dealerNoQualify: 1, push: 0, lose: -1, fold: -1 } as const;
  const ante = $derived(spotView(betting, game.roundAnte, 1, game.ante, settled ? ANTE_NET[settled] : undefined));
  const raiseNet = $derived.by(() => {
    const r = view.raise ?? 0;
    if (!settled || r === 0) return undefined;
    return settled === 'win' ? r : settled === 'lose' ? -r : 0;
  });
  const raise = $derived(spotView(betting, game.roundAnte, view.raise ?? 0, new Decimal(0), raiseNet));
  const sides = $derived(
    game.rules.sideBets.map((def) => {
      const live = view.sideBets.find((b) => b.def.id === def.id);
      const mine = live?.owner === 'player';
      const spot = spotView(
        betting,
        game.roundAnte,
        mine ? live.stake : 0,
        game.side.amount(def.id),
        mine && live.net !== null ? live.net : undefined,
      );
      // While the hand plays, the spot keeps count: cards towards the bet, then what it pays.
      const counting = !betting && live && live.owner !== 'none' && live.net === null && live.progress > 0;
      return {
        def,
        label: def.name.replace('Flush ', ''),
        owner: live?.owner ?? 'none',
        badge: counting ? (live.livePays > 0 ? `pays ${live.livePays}:1` : `${live.progress}/${live.target}`) : undefined,
        hot: !!counting && live.progress >= live.target - 1,
        ...spot,
      };
    }),
  );

  function placeAnte() {
    if (game.bets.addMain(heldValue(game.bank))) sfx.chip();
  }

  const result = $derived.by(() => {
    if (view.net === null || !view.outcome || betting) return null;
    const net = game.roundAnte.mul(view.net);
    return { title: OUTCOME_TEXT[view.outcome]!, net, detail: view.verdict ?? undefined, big: view.net >= 10 };
  });

  const choice = $derived(game.betChoice);
  const raiseOptions = $derived(
    choice
      ? Array.from({ length: choice.cap + 1 }, (_, r) => ({
          label: r === 0 ? 'Fold' : `Raise ${r}×`,
          sub: r === 0 ? undefined : formatMoney(game.roundAnte.mul(r)),
          key: r === 0 ? 'F' : String(r),
          suggested: r === choice.suggested,
          pick: () => game.chooseRaise(r),
        }))
      : [],
  );
  const flipOptions = [{ label: 'Flip all', key: 'A', pick: () => game.flipAll() }];

  function begin() {
    unlockAudio();
    game.start();
  }

  function onKey(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('input, select, textarea, dialog')) return;
    const key = e.key.toLowerCase();
    if (game.awaiting === 'bet') {
      if (key === 'f' || key === '0') return game.chooseRaise(0);
      if (/^[1-9]$/.test(key)) return game.chooseRaise(Number(key));
    }
    if (game.awaiting === 'flip' && key === 'a') return game.flipAll();
    if (e.key !== ' ' && e.key !== 'Enter') return;
    if (target.closest('button, a')) return;
    e.preventDefault();
    game.advance();
  }
</script>

<svelte:window onkeydown={onKey} />
<RulesDialog bind:this={rulesDialog} rules={game.rules} />

<TableShell
  title={['Idle', 'Suits']}
  bank={game.bank}
  seq={game}
  autoPlay={game.autoPlay}
  onAuto={(on) => game.setAutoPlay(on)}
  {muted}
  onMute={(m) => (muted = m)}
  onRules={() => rulesDialog?.open()}
  {onExit}
  onTapFelt={() => (game.awaiting === 'flip' || game.awaiting === 'deal') && game.advance()}
  cards={{ across: 7.5, rows: 2, reserve: 292 }}
>
  {#snippet felt()}
    <!-- The lights dim while a card that could swing the hand is about to turn. -->
    <div class="vignette" class:on={view.drama === 'tense'} aria-hidden="true"></div>

    <div class="layout">
      <div class="area dealer">
        <HandRow
          title="Dealer"
          hand={view.dealer}
          side="dealer"
          {flipMs}
          deal={game.deals}
          dealOrder={1}
          winner={view.net !== null && view.outcome === 'lose'}
          decider={view.outcome === 'lose' ? view.decider : null}
        >
          {#snippet badge()}
            {#if view.qualified !== null}
              <span class="hand-tag" class:good={!view.qualified}>{view.qualified ? 'Qualified' : 'No qualify'}</span>
            {/if}
          {/snippet}
        </HandRow>
      </div>

      <FeltBand
        title="Idle Suits"
        lines={['Most cards in one suit wins', 'Raise up to 3× on a big flush']}
        {result}
      />

      <div class="spots">
        {#each sides as side, i (side.def.id)}
          <BetSpot
            label={side.label}
            shape={i === 0 ? 'diamond' : 'circle'}
            size="sm"
            hint={side.owner === 'dealer' ? "dealer's" : undefined}
            amount={side.amount}
            net={side.net}
            next={side.next}
            badge={side.badge}
            hot={side.hot}
            onPlace={() => game.bets.addSide(side.def.id, heldValue(game.bank)) && sfx.chip()}
            onClear={() => game.bets.clearSide(side.def.id)}
          />
          {#if i === 0}
            <BetSpot
              label="Ante"
              size="lg"
              amount={ante.amount}
              net={ante.net}
              next={ante.next}
              onPlace={placeAnte}
              onClear={() => game.bets.clearMain()}
            />
            <BetSpot
              label="Raise"
              size="lg"
              hint="1× to 3×"
              amount={raise.amount}
              net={raise.net}
              active={game.awaiting === 'bet'}
            />
          {/if}
        {/each}
      </div>

      <div class="area player">
        <HandRow
          title="You"
          hand={view.player}
          side="player"
          {flipMs}
          deal={game.deals}
          dealOrder={0}
          winner={view.net !== null && (view.outcome === 'win' || view.outcome === 'dealerNoQualify')}
          decider={view.outcome === 'win' ? view.decider : null}
          onFlip={game.awaiting === 'flip' ? (slot) => game.flip(slot) : undefined}
        />
      </div>
    </div>

    <SeatOverlay
      started={game.started}
      gameOver={game.gameOver}
      intro="Build the biggest flush you can, then see if it beats the dealer's."
      hands={game.hands}
      biggestWin={game.biggestWin}
      onSeat={begin}
      onRules={() => rulesDialog?.open()}
      onRestart={() => game.restart()}
    />
  {/snippet}

  {#snippet action()}
    {#if game.awaiting === 'bet' && choice}
      <DecisionBar
        options={raiseOptions}
        hint={`Plan says ${choice.suggested === 0 ? 'fold' : `raise ${choice.suggested}×`}`}
      />
    {:else if game.awaiting === 'flip'}
      <DecisionBar options={flipOptions} hint="Tap your cards to turn them over" />
    {:else}
      <BetBar
        bank={game.bank}
        total={game.bets.total}
        canDeal={game.awaiting === 'deal' && game.bets.canDeal}
        onDeal={() => game.deal()}
        onClear={() => game.bets.clearAll()}
        onDouble={() => game.bets.double()}
        trailing={game.autoPlay && game.started ? pause : undefined}
      />
    {/if}
  {/snippet}

  {#snippet panels()}
    <TablePanels
      seq={game}
      {muted}
      onMute={(m) => (muted = m)}
      seed={game.runSeed}
      round={game.round}
      onRestart={() => game.restart()}
      last={view.last}
      lastUnit={game.lastAnte}
      stats={[
        ['Hands', String(game.hands)],
        ['Biggest win', formatMoney(game.biggestWin)],
        ...Object.entries(game.flushCounts)
          .filter(([size]) => Number(size) >= 5)
          .map(([size, count]): [string, string] => [`${size}-card flushes`, String(count)]),
      ]}
      sessionNet={game.sessionNet}
      history={game.history.map((h) => ({
        round: h.round,
        text: `${h.size}${SUIT_SYMBOL[h.suit]}`,
        sub: h.outcome === 'dealerNoQualify' ? 'no qual' : h.outcome,
        net: h.net,
      }))}
    >
      <BetPanel {game} />
      <section class="tiles">
        {#each game.rules.sideBets as def (def.id)}
          <SideBetTile
            {def}
            view={view.sideBets.find((b) => b.def.id === def.id)}
            nextStake={game.side.amount(def.id)}
            dealerClaims={game.dealerClaims}
            ante={game.roundAnte}
          />
        {/each}
      </section>
    </TablePanels>
  {/snippet}
</TableShell>

{#snippet pause()}
  <button type="button" class="pause" onclick={() => game.togglePause()}>{game.paused ? 'Resume' : 'Pause'}</button>
{/snippet}

<style>
  .vignette {
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;
    border-radius: inherit;
    background: radial-gradient(ellipse at center, transparent 30%, rgb(0 0 0 / 0.6) 100%);
    opacity: 0;
    transition: opacity 300ms;
  }
  .vignette.on {
    opacity: 1;
  }
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
    gap: clamp(12px, 3.6cqw, 28px);
  }
  .pause {
    min-width: 108px;
    min-height: 44px;
  }
  .tiles {
    display: grid;
    gap: 10px;
  }
  /* Landscape phones: the hands stacked on the left, the bets in a block on the right. */
  @media (orientation: landscape) and (max-height: 520px) {
    .layout {
      --card-w: clamp(28px, min(calc((100cqw - 150px) / 8.4), calc((100cqh - 96px) / 2.8)), 90px);
      position: relative;
      grid-template-columns: 1fr auto;
      grid-template-rows: 1fr 1fr;
      grid-template-areas:
        'dealer spots'
        'player spots';
      column-gap: 10px;
    }
    .spots {
      flex-wrap: wrap;
      width: 136px;
      align-content: center;
      gap: 4px 8px;
    }
  }
</style>
