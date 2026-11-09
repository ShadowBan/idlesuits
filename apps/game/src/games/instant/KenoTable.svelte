<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    GOLD_BALL_X,
    KENO_BUFFS,
    KENO_CARD_SHARE,
    KENO_DRAWN,
    KENO_GOLD_RUSH_X,
    KENO_MAX_SPOTS,
    KENO_NUMBERS,
    KENO_PATTERN_ODDS,
    KENO_ROW_SHARE,
    KENO_ROW_SIZE,
    KENO_ROWS,
    kenoBuffDef,
    kenoBuffRate,
    kenoOdds,
    type KenoBuffKind,
    type KenoPattern,
  } from '@idlesuits/sim';
  import RulesFrame from '../../components/RulesFrame.svelte';
  import SeatOverlay from '../../components/SeatOverlay.svelte';
  import TablePanels from '../../components/TablePanels.svelte';
  import TableShell from '../../components/TableShell.svelte';
  import type { GameProps } from '../../lib/games';
  import { Decimal, formatMoney } from '../../lib/money';
  import { unlockAudio } from '../../lib/sound';
  import BetPicker from './BetPicker.svelte';
  import { KenoGame, type KenoWin } from './keno.svelte';
  import './instant.css';

  let { onExit }: GameProps = $props();

  const game = new KenoGame();
  const seq = game.seq;
  onDestroy(() => game.dispose());
  let rules = $state<RulesFrame>();

  const numbers = Array.from({ length: KENO_NUMBERS }, (_, i) => i + 1);
  const spots = $derived(game.ticket.length);
  const picked = $derived(new Set(game.ticket));
  /** Each row of the Gold Card: how many of its ten are stamped. */
  const rowCounts = $derived(
    Array.from({ length: KENO_ROWS }, (_, r) => Array.from({ length: KENO_ROW_SIZE }, (_, i) => r * KENO_ROW_SIZE + i + 1).filter((n) => game.card.has(n)).length),
  );
  const doneRows = $derived(new Set(game.cardNews?.rows ?? []));
  const rowOf = (n: number) => Math.floor((n - 1) / KENO_ROW_SIZE);
  /** Each buff's look: its colour and what it does in full. */
  const BUFF: Record<KenoBuffKind, { color: string; does: string }> = {
    double: { color: '#ff7a5c', does: `Your next ${kenoBuffDef('double').draws} draws pay ×2.` },
    freeSpot: { color: '#5fd0ff', does: `Your next ${kenoBuffDef('freeSpot').draws} draws get a free extra number; it counts as yours if it\u2019s drawn.` },
    freeDraws: { color: '#8cf08a', does: `${kenoBuffDef('freeDraws').draws} draws on the house, at your bet.` },
    goldRush: { color: '#ffd75e', does: `Your next ${kenoBuffDef('goldRush').draws} draws, the gold ball pays ×${KENO_GOLD_RUSH_X} instead of ×${GOLD_BALL_X}.` },
  };
  const PATTERN_BUFF = Object.fromEntries(KENO_BUFFS.map((d) => [d.pattern, d.kind])) as Record<KenoPattern, KenoBuffKind>;
  /** The number each pattern lit on the board this draw, by the buff colour of its meter. */
  const lit = $derived.by(() => {
    const m = new Map<number, string>();
    for (const [p, ns] of Object.entries(game.patterns)) for (const n of ns ?? []) m.set(n, BUFF[PATTERN_BUFF[p as KenoPattern]].color);
    return m;
  });
  /** Each pattern drawn small, as dots on a little board, for its meter. */
  const GLYPH: Record<KenoPattern, [number, number][]> = {
    run: [3, 9, 15, 21, 27].map((x) => [x, 10] as [number, number]),
    tower: [2, 5.2, 8.4, 11.6, 14.8, 18].map((y) => [15, y] as [number, number]),
    crowd: [3, 7, 11, 15, 19, 23, 27].map((x, i) => [x, i % 2 ? 7 : 13] as [number, number]),
    corners: [
      [3, 3],
      [27, 3],
      [27, 17],
    ],
  };
  const free = $derived(game.drawBuff?.free);
  const queue = $derived(game.buffs.queue);
  const ago = (w: { draw: number }) => (game.rounds >= w.draw ? `draw #${w.draw}` : 'earlier draw');
  const drawn = $derived(game.drawn);
  const gold = $derived(game.balls.length === KENO_DRAWN ? game.balls[KENO_DRAWN - 1]! : null);
  const odds = $derived(kenoOdds(Math.max(1, spots)));
  /** The ticket's winning lines, most hits first: what each catch pays. */
  const lines = $derived(
    game.pays
      .map((x, k) => ({ k, x, p: odds[k]! }))
      .filter((l) => l.x > 0)
      .reverse(),
  );
  const top = $derived(Math.max(...game.pays));
  const fmtX = (x: number) => (x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2));
  const pct = (p: number) => (p >= 0.01 ? `${(p * 100).toFixed(1)}%` : `1 in ${Math.round(1 / p).toLocaleString('en-US')}`);

  function onKey(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('input, select, textarea, dialog, aside, button')) return;
    if (e.key === 'ArrowUp' && !game.drawing) return game.setStep(game.step + 1);
    if (e.key === 'ArrowDown' && !game.drawing) return game.setStep(game.step - 1);
    if (e.key === 'q') return game.quickPick();
    if (e.key === 'c') return game.clearPicks();
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (!game.autoPlay) void game.play();
  }

  function begin() {
    unlockAudio();
    game.start();
    if (!game.picks.length) game.quickPick(5);
  }
</script>

<svelte:window onkeydown={onKey} />

<RulesFrame
  bind:this={rules}
  steps={[
    { title: 'Mark your numbers', demo: '1–10 of 80', text: 'Tap the numbers you like, or Quick pick. More numbers, longer odds and bigger prizes.' },
    { title: 'Twenty balls', demo: '20 drawn', text: 'Twenty of the eighty are drawn, one at a time. Every one of yours that comes up is a hit.' },
    { title: 'Get paid', demo: '5 of 6', text: 'The ticket pays by how many hits it caught. The last ball is gold: catch it and the win is multiplied.' },
  ]}
  glance={[
    {
      heading: 'Your ticket',
      items: [
        { name: 'Bet', tag: 'one bet a draw', text: 'Set with − and +. The ticket plays for that bet, draw after draw, until you change it.' },
        { name: 'Spots', tag: '1 to 10', text: 'The numbers you mark. Each count has its own pay table, in the Pays tab: more spots, rarer hits, bigger tops.' },
        { name: 'Hits', text: 'Your numbers among the 20 drawn. The more you catch, the more the ticket pays; too few pays nothing.' },
      ],
    },
    {
      heading: 'The gold ball',
      note: 'The twentieth ball drawn is gold.',
      items: [
        { name: 'Catch it', tag: `wins ×${GOLD_BALL_X}`, text: `If the gold ball is one of your numbers, whatever the ticket wins is multiplied by ${GOLD_BALL_X}.` },
        { name: 'How often', tag: `${Math.max(1, spots)} in 80`, text: 'The gold ball is any one of the 80 numbers, so each number you mark is another chance at it.' },
      ],
    },
    {
      heading: 'Pattern meters',
      note: 'Patterns among a paid draw\u2019s 20 balls fill four meters. A full meter earns a buff; buffs wait their turn and run one at a time.',
      items: KENO_BUFFS.map((d) => ({
        name: d.name,
        tag: `${d.patternName} · ${d.steps} to fill`,
        text: `${BUFF[d.kind].does} The pattern turns up about 1 draw in ${Math.round(1 / KENO_PATTERN_ODDS[d.pattern])}; the buff comes about once in ${Math.round(1 / kenoBuffRate(d))} paid draws.`,
      })),
    },
    {
      heading: 'The Gold Card',
      note: 'The board keeps your stamps from draw to draw, and between visits.',
      items: [
        { name: 'Stamps', text: 'Every draw stamps the gold ball’s number, whoever’s it is, and every number your ticket catches. Mark numbers in a row you’re close to finishing.' },
        { name: 'Finish a row', tag: 'Row pot', text: 'All ten numbers of a row stamped wins the Row pot.' },
        { name: 'Fill the card', tag: 'Card pot', text: 'All 80 stamped wins the Card pot, and the card starts again.' },
        { name: 'The pots', tag: `${(KENO_ROW_SHARE * 100).toFixed(0)}% + ${(KENO_CARD_SHARE * 100).toFixed(0)}%`, text: 'Each draw adds a share of its bet to each pot, so they grow as you play and pay back what went in.' },
      ],
    },
  ]}
>
  {#snippet goal()}
    Mark up to ten numbers and <b>catch as many as you can</b> among the twenty drawn.
  {/snippet}
  <details>
    <summary>The odds</summary>
    <ul>
      <li>Every ball is drawn at random from those left, so every number is as likely as any other. Past draws don't change the next.</li>
      <li>
        The chance of each catch is exact: of the 20 balls, how many fall among your numbers. With {Math.max(1, spots)}
        {spots === 1 ? 'spot' : 'spots'}, catching them all is {pct(odds[Math.max(1, spots)]!)}.
      </li>
      <li>
        This ticket pays back {(game.ticketPayback * 100).toFixed(1)}%, the gold ball included; the buffs add
        {(game.buffPayback * 100).toFixed(1)}% on average and the Gold Card's pots {((KENO_ROW_SHARE + KENO_CARD_SHARE) * 100).toFixed(0)}%:
        {(game.payback * 100).toFixed(1)}% in all, exactly the floor's payback, however many numbers you mark.
      </li>
      <li>
        The meters only fill on paid draws, and your bet stays put while a buff is waiting or running, so a buff always plays at the bet
        that earned it. Buffs and meters are kept between visits.
      </li>
      <li>Your last 50 wins are in Stats. Tap one to draw it again exactly, ball for ball. A replay stakes and pays nothing.</li>
    </ul>
  </details>
  <details>
    <summary>Playing here</summary>
    <ul>
      <li><kbd>Space</kbd> draws · <kbd>Q</kbd> quick pick · <kbd>C</kbd> clears the ticket · arrow keys change the bet.</li>
      <li>Your numbers stay marked from draw to draw, and auto play keeps drawing on them.</li>
    </ul>
  </details>
</RulesFrame>

<TableShell
  {seq}
  machine
  cabinet="keno"
  title={['Golden', 'Keno']}
  bank={game.bank}
  autoPlay={game.autoPlay}
  onAuto={(on) => game.setAutoPlay(on)}
  onRules={() => rules?.open()}
  {onExit}
  replay={game.replaying
    ? {
        label: `${ago(game.replaying)} · ${game.replaying.ticket.length} spots`,
        result: game.replayDone && game.paid && game.result ? `${game.result.hits.length} caught · ${game.paid.x > 0 ? `+${formatMoney(game.paid.bet.mul(game.paid.x))}` : 'no win'}` : undefined,
        won: !!game.paid && game.paid.x > 0,
        done: game.replayDone,
        onClose: () => game.stopReplay(),
      }
    : null}
>
  {#snippet felt()}
    <div class="istage keno" class:replaying={!!game.replaying}>
      <!-- The draw: twenty balls in the order they came out, the last one gold. -->
      <div class="tray" aria-label="Balls drawn" aria-live="polite">
        {#each { length: KENO_DRAWN } as _, i (i)}
          {@const ball = game.balls[i]}
          <span class="slot" class:last={i === KENO_DRAWN - 1}>
            {#if ball !== undefined}
              <span class="ball" class:hit={picked.has(ball) || free === ball} class:gold={i === KENO_DRAWN - 1}>{ball}</span>
            {/if}
          </span>
        {/each}
      </div>

      <!-- Left: what this ticket pays, lit at the catch it's on, and the Gold Card. -->
      <div class="side left">
        <section class="card pays" aria-label="This ticket's pays">
          <h3>{spots || 1} {spots === 1 ? 'spot' : 'spots'} <span>pays</span></h3>
          <ol>
            {#each lines as l (l.k)}
              <li class:now={(game.drawing || game.result) && game.hits === l.k} class:top={l.x === top}>
                <span>{l.k} of {spots || 1}</span>
                <b>{fmtX(l.x)}×</b>
              </li>
            {/each}
          </ol>
          <p class="hint">Gold ball ×{GOLD_BALL_X}</p>
        </section>

        <section class="card goldcard" aria-label="Gold Card">
          <h3>Gold Card <span>{game.card.size}/{KENO_NUMBERS}</span></h3>
          <div class="fill" style:--f={game.card.size / KENO_NUMBERS}><i></i></div>
          <div class="pot"><span>Row pot</span><b>{formatMoney(game.rowPot)}</b></div>
          <div class="pot big"><span>Card pot</span><b>{formatMoney(game.cardPot)}</b></div>
        </section>
      </div>

      <!-- The board: your marks, the balls drawn, your catches; the Gold Card's stamps along each number's foot. -->
      <div class="board" role="group" aria-label="Keno board, 1 to 80">
        {#each numbers as n (n)}
          {@const mine = picked.has(n)}
          {@const out = drawn.has(n)}
          <button
            type="button"
            class="cell"
            class:mine
            class:out
            class:hit={(mine || free === n) && out}
            class:gold={gold === n}
            class:stamped={game.card.has(n) || (game.cardNews !== null && game.freshStamps.has(n))}
            class:fresh={game.freshStamps.has(n)}
            class:rowdone={doneRows.has(rowOf(n))}
            class:free={free === n}
            class:lit={lit.has(n)}
            class:full={!mine && spots >= KENO_MAX_SPOTS && !game.busy}
            style:--lit={lit.get(n)}
            aria-pressed={mine}
            disabled={game.busy || (!mine && spots >= KENO_MAX_SPOTS)}
            onclick={() => game.toggle(n)}
          >
            <span>{n}</span>
          </button>
          {#if n % KENO_ROW_SIZE === 0}
            {@const r = rowOf(n)}
            {@const finished = rowCounts[r] === KENO_ROW_SIZE || doneRows.has(r)}
            <span
              class="rowring"
              class:done={finished}
              class:now={doneRows.has(r)}
              class:near={rowCounts[r]! >= 8}
              style:--f={(finished ? KENO_ROW_SIZE : rowCounts[r]!) / KENO_ROW_SIZE}
              title="Gold Card row: {rowCounts[r]} of {KENO_ROW_SIZE} stamped"
              aria-label="Row {r + 1}: {rowCounts[r]} of {KENO_ROW_SIZE} stamped"
            >
              <i>{finished ? '★' : rowCounts[r]}</i>
            </span>
          {/if}
        {/each}
      </div>

      <!-- Right: the buff running now, and the four pattern meters. -->
      <div class="side right">
        {#if queue.length}
          {@const head = queue[0]!}
          <section class="buffnow" style:--c={BUFF[head.kind].color} aria-live="polite">
            <b>{kenoBuffDef(head.kind).name}</b>
            <span>{kenoBuffDef(head.kind).blurb}</span>
            <em>{head.left} {head.left === 1 ? 'draw' : 'draws'} left</em>
            {#if queue.length > 1}<small>then {queue.slice(1).map((b) => kenoBuffDef(b.kind).name).join(', ')}</small>{/if}
          </section>
        {/if}
        <div class="meters" aria-label="Pattern meters">
          {#each KENO_BUFFS as def (def.kind)}
            {@const at = game.buffs.meters[def.pattern]}
            {@const stepped = !!game.patterns[def.pattern]}
            <div class="meter" class:stepped style:--c={BUFF[def.kind].color} title="{def.patternName}: about 1 draw in {Math.round(1 / KENO_PATTERN_ODDS[def.pattern])}. Fill it for {def.name}: {BUFF[def.kind].does}">
              <svg class="glyph" viewBox="0 0 30 20" aria-hidden="true">
                {#each GLYPH[def.pattern] as [x, y], i (i)}<circle cx={x} cy={y} r="2.2" />{/each}
              </svg>
              <span class="name">{def.name}</span>
              <span class="pat">{def.patternName}</span>
              <span class="pips" aria-label="{at} of {def.steps}">
                {#each { length: def.steps } as _, i (i)}<i class:on={i < at} class:new={stepped && i === at - 1}></i>{/each}
              </span>
            </div>
          {/each}
        </div>
      </div>

      {#if game.earned.length && !game.replaying}
        {#key game.rounds}
          <div class="earned" aria-live="polite">
            {#each game.earned as kind (kind)}
              {@const def = kenoBuffDef(kind)}
              <div style:--c={BUFF[kind].color}>
                <span>{def.patternName} · meter full</span>
                <b>{def.name}!</b>
                <small>{BUFF[kind].does}</small>
              </div>
            {/each}
          </div>
        {/key}
      {/if}


      {#if game.result && game.paid}
        {@const r = game.result}
        {@const news = game.replaying ? null : game.cardNews}
        {#key `${game.rounds}:${game.replaying?.round}`}
          <div class="verdict" class:won={game.paid.x > 0} class:gold={(r.gold && r.pay > 0) || !!news?.full} class:long={!!news}>
            <span>{r.hits.length} of {spots} caught{r.gold ? ' · gold ball!' : ''}</span>
            <b>{game.paid.x > 0 ? `+${formatMoney(game.paid.bet.mul(game.paid.x))}` : 'No win'}</b>
            {#if news?.full}
              <span class="card-news">Gold Card full! Card pot {formatMoney(news.cardPot)}</span>
            {/if}
            {#if news?.rows.length}
              <span class="card-news">{news.rows.length === 1 ? 'Row' : `${news.rows.length} rows`} complete · Row pot {formatMoney(news.rowPot)}</span>
            {/if}
          </div>
        {/key}
      {/if}

      <SeatOverlay
        started={game.started}
        gameOver={game.gameOver}
        intro="Mark up to ten numbers of 80, then twenty balls are drawn. The more of yours come up, the more the ticket pays, and the last ball is gold."
        hands={game.rounds}
        biggestWin={game.biggestWin}
        onSeat={begin}
        onRules={() => rules?.open()}
        onRestart={() => game.restart()}
      />
    </div>
  {/snippet}

  {#snippet action()}
    <div class="ibar">
      <BetPicker {game} locked={game.betLocked} />
      <div class="isegmented" role="group" aria-label="Ticket">
        <button type="button" disabled={game.busy} onclick={() => game.quickPick()}>Quick pick</button>
        <button type="button" disabled={game.busy || !game.picks.length} onclick={() => game.clearPicks()}>Clear</button>
      </div>
      <button type="button" class="go primary" disabled={!game.canPlay || game.autoPlay} onclick={() => game.play()}>
        {game.drawing ? 'Drawing…' : game.replaying && !game.replayDone ? 'Replaying…' : game.freeDraw ? `Free draw · ${game.nextBuff?.left} left` : 'Draw'}
      </button>
      <span class="note" class:err={!!game.error}>
        {game.error ? game.error : spots ? `${spots} ${spots === 1 ? 'spot' : 'spots'} · tops out at ${fmtX(top)}×, ×${GOLD_BALL_X} on the gold ball` : 'Mark 1 to 10 numbers, or Quick pick'}
      </span>
    </div>
  {/snippet}

  {#snippet panels()}
    <TablePanels
      {seq}
      autoPlay={game.autoPlay}
      onAuto={(on) => game.setAutoPlay(on)}
      seed={game.lastReplay ? game.lastReplay.run.slice(0, 12) : '—'}
      round={game.lastReplay?.round ?? 0}
      last={game.last}
      lastUnit={game.lastBet}
      stats={game.stats('Draws')}
      sessionNet={game.sessionNet}
      history={game.history}
      replay={{ data: game.lastReplay, play: (d) => game.replay(d as KenoWin), busy: game.busy }}
    >
      <section class="panel ipanel">
        <h2>This ticket <span>{spots || 1} {spots === 1 ? 'spot' : 'spots'}</span></h2>
        <table class="ladder">
          <thead><tr><th>Catch</th><th>Pays</th><th>Chance</th></tr></thead>
          <tbody>
            {#each lines as l (l.k)}
              <tr>
                <td>{l.k} of {spots || 1}</td>
                <td>{fmtX(l.x)}× · {formatMoney(game.bet.mul(l.x))}</td>
                <td>{pct(l.p)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
        <p class="note">
          Catch the gold ball (the last drawn) and the win is ×{GOLD_BALL_X}. The ticket pays back {(game.ticketPayback * 100).toFixed(1)}%, the
          buffs {(game.buffPayback * 100).toFixed(1)}%, and the Gold Card's pots {((KENO_ROW_SHARE + KENO_CARD_SHARE) * 100).toFixed(0)}%:
          {(game.payback * 100).toFixed(1)}% in all, exactly.
        </p>
      </section>
      <section class="panel ipanel">
        <h2>Gold Card <span>{game.card.size} of {KENO_NUMBERS} stamped</span></h2>
        <div class="row"><span>Row pot</span><b>{formatMoney(game.rowPot)}</b></div>
        <div class="row"><span>Card pot</span><b>{formatMoney(game.cardPot)}</b></div>
        <p class="note">
          Every draw stamps the gold ball's number and every number you catch. Finish a row of ten for the Row pot; stamp all 80 for the Card
          pot. Each draw adds {(KENO_ROW_SHARE * 100).toFixed(0)}% of its bet to each pot.
        </p>
      </section>
    </TablePanels>
  {/snippet}
</TableShell>

<style>
  /*
   * One colour, one meaning: cream for your marks, silver for a drawn ball,
   * green for a catch, gold for the gold ball (and only that), cyan for a
   * Free Spot. The Gold Card's stamps are a thin gold line at a number's foot.
   */
  .keno {
    container-type: size;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-areas:
      'tray tray tray'
      'left board right';
    align-items: center;
    justify-items: stretch;
    gap: 2.4cqh 2cqw;
    padding: 2cqh 2cqw;
    --cell: min(5.5cqw, 8.4cqh);
    --ball: min(4.1cqw, 6.6cqh);
  }

  /* The draw: a rail of twenty slots, the last ringed for the gold ball. */
  .tray {
    grid-area: tray;
    justify-self: center;
    display: grid;
    grid-template-columns: repeat(20, var(--ball));
    gap: min(0.5cqw, 0.6cqh);
    padding: 6px 10px;
    border-radius: 999px;
    background: linear-gradient(#050b17, #0b1a33);
    box-shadow:
      inset 0 2px 6px rgb(0 0 0 / 0.7),
      0 1px 0 rgb(255 255 255 / 0.06);
  }
  .slot {
    width: var(--ball);
    height: var(--ball);
    border-radius: 50%;
    background: rgb(255 255 255 / 0.04);
  }
  .slot.last {
    box-shadow: inset 0 0 0 1.5px rgb(232 192 106 / 0.6);
  }
  .ball {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #ffffff, #c9d6ea 60%, #8193b0);
    color: #0b1a33;
    font: 700 calc(var(--ball) * 0.42) / 1 var(--font-ui);
    font-variant-numeric: tabular-nums;
    animation: drop 260ms cubic-bezier(0.3, 1.5, 0.5, 1);
  }
  .ball.hit {
    background: radial-gradient(circle at 35% 30%, #fff, #8cf0b8 55%, #1f9a5a);
    box-shadow: 0 0 10px rgb(140 240 184 / 0.7);
  }
  .ball.gold {
    background: radial-gradient(circle at 35% 30%, #fff8dc, #ffd75e 50%, #b8861e);
    box-shadow: 0 0 14px rgb(255 215 94 / 0.9);
    color: #3a2600;
    animation:
      drop 500ms cubic-bezier(0.3, 1.5, 0.5, 1),
      shine 1.2s ease-in-out 500ms infinite alternate;
  }
  @keyframes drop {
    from {
      transform: translateY(-120%) scale(0.6);
      opacity: 0;
    }
  }
  @keyframes shine {
    to {
      box-shadow: 0 0 22px rgb(255 215 94 / 1);
    }
  }

  /* The board: ten columns of numbers and a ring at each row's end for its Gold Card progress. */
  .board {
    grid-area: board;
    display: grid;
    grid-template-columns: repeat(10, var(--cell)) calc(var(--cell) * 0.62);
    grid-auto-rows: calc(var(--cell) * 0.86);
    gap: calc(var(--cell) * 0.1);
    padding: calc(var(--cell) * 0.16);
    border-radius: 14px;
    background: linear-gradient(rgb(6 14 30 / 0.85), rgb(4 10 22 / 0.85));
    box-shadow:
      inset 0 0 0 1px rgb(232 192 106 / 0.3),
      0 10px 30px rgb(0 0 0 / 0.35);
  }
  .cell {
    position: relative;
    isolation: isolate;
    display: grid;
    place-items: center;
    min-height: 0;
    padding: 0;
    border: 0;
    border-radius: 8px;
    background: #152848;
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.06);
    color: #9fb2d3;
    font: 600 calc(var(--cell) * 0.36) / 1 var(--font-ui);
    font-variant-numeric: tabular-nums;
    transition:
      background 120ms,
      color 120ms,
      opacity 120ms;
  }
  .cell span {
    position: relative;
  }
  .cell:hover:not(:disabled) {
    background: #1f3864;
    color: #e8eef9;
  }
  .cell:disabled {
    opacity: 1;
    cursor: default;
  }
  /* Ten marked: the rest of the board steps back. */
  .cell.full:not(.out) {
    opacity: 0.45;
  }

  /* Your marks: cream, like crayon on a ticket — the brightest thing on the board. */
  .cell.mine {
    background: linear-gradient(#fff8e6, #ecdcb4);
    color: #0f1f3d;
    font-weight: 800;
    box-shadow:
      inset 0 0 0 2px rgb(15 31 61 / 0.25),
      0 2px 0 #9c8a5c,
      0 0 12px rgb(255 240 200 / 0.25);
  }
  .cell.mine:hover:not(:disabled) {
    background: linear-gradient(#fffdf4, #f2e5c4);
    color: #0f1f3d;
  }

  /* A drawn ball on a number that isn't yours: a silver ball sits on it. */
  .cell.out::before {
    content: '';
    position: absolute;
    z-index: -1;
    inset: 12%;
    margin: auto;
    aspect-ratio: 1;
    max-height: 76%;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #ffffff, #c4d0e4 60%, #7d8eab);
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.5);
    animation: land 220ms cubic-bezier(0.3, 1.6, 0.5, 1);
  }
  .cell.out {
    color: #0b1a33;
    font-weight: 700;
  }
  @keyframes land {
    from {
      transform: scale(0.3);
      opacity: 0;
    }
  }

  /* A catch: yours and drawn. */
  .cell.hit {
    background: radial-gradient(circle at 50% 35%, #b8ffd6, #2fbf6e 60%, #15804a);
    color: #fff;
    font-weight: 800;
    text-shadow: 0 1px 2px rgb(0 0 0 / 0.45);
    box-shadow:
      inset 0 0 0 2px rgb(255 255 255 / 0.5),
      0 0 16px rgb(47 191 110 / 0.6);
    animation: pop 320ms ease;
  }
  .cell.hit::before {
    display: none;
  }
  /* The gold ball: on its number, gold; caught, all gold. */
  .cell.gold.out:not(.hit)::before {
    background: radial-gradient(circle at 35% 30%, #fff8dc, #ffd75e 50%, #b8861e);
    box-shadow: 0 0 12px rgb(255 215 94 / 0.8);
  }
  .cell.gold.hit {
    background: radial-gradient(circle at 50% 35%, #fff8dc, #ffd75e 55%, #b8861e);
    color: #3a2600;
    text-shadow: none;
    box-shadow:
      inset 0 0 0 2px #fff,
      0 0 22px rgb(255 215 94 / 0.95);
  }
  /* A Free Spot's number: on the house, in cyan. */
  .cell.free:not(.hit) {
    background: linear-gradient(#bff0ff, #6fd2f4);
    color: #032433;
    font-weight: 800;
    box-shadow:
      inset 0 0 0 2px rgb(3 36 51 / 0.25),
      0 0 12px rgb(95 208 255 / 0.5);
  }
  .cell.free.hit {
    background: radial-gradient(circle at 50% 35%, #e6fbff, #5fd0ff 60%, #1a6488);
    color: #032433;
    text-shadow: none;
  }
  /* A pattern this draw made: its numbers ringed in its meter's colour. */
  .cell.lit {
    outline: 2px solid var(--lit);
    outline-offset: 1px;
  }

  /* The Gold Card's stamp: a thin gold line along the number's foot, kept from draw to draw. */
  .cell.stamped::after {
    content: '';
    position: absolute;
    left: 32%;
    right: 32%;
    bottom: 8%;
    height: 2px;
    border-radius: 2px;
    background: rgb(255 215 94 / 0.5);
  }
  .cell.mine.stamped::after,
  .cell.free.stamped::after {
    background: rgb(156 110 20 / 0.8);
  }
  .cell.hit.stamped::after {
    background: rgb(255 255 255 / 0.7);
  }
  .cell.fresh::after {
    animation: stampline 600ms ease;
  }
  @keyframes stampline {
    from {
      left: 50%;
      right: 50%;
      background: #fff;
    }
  }
  /* A row finished this draw: it shines gold. */
  .cell.rowdone {
    animation: rowdone 900ms ease 2;
  }
  @keyframes rowdone {
    50% {
      box-shadow:
        inset 0 0 0 2px #ffd75e,
        0 0 18px rgb(255 215 94 / 0.7);
    }
  }
  @keyframes pop {
    40% {
      transform: scale(1.15);
    }
  }

  /* Each row's Gold Card progress: a ring filling to ten. */
  .rowring {
    display: grid;
    place-items: center;
    align-self: center;
    justify-self: center;
    width: calc(var(--cell) * 0.52);
    aspect-ratio: 1;
    border-radius: 50%;
    background: conic-gradient(rgb(255 215 94 / 0.75) calc(var(--f) * 360deg), rgb(255 255 255 / 0.08) 0);
  }
  .rowring i {
    display: grid;
    place-items: center;
    width: 74%;
    aspect-ratio: 1;
    border-radius: 50%;
    background: #08122a;
    font: 700 calc(var(--cell) * 0.2) / 1 var(--font-ui);
    font-style: normal;
    color: rgb(207 220 242 / 0.6);
  }
  .rowring.near i {
    color: #ffd75e;
  }
  .rowring.done {
    background: #ffd75e;
  }
  .rowring.done i {
    color: #ffd75e;
    font-size: calc(var(--cell) * 0.24);
  }
  .rowring.now {
    box-shadow: 0 0 14px rgb(255 215 94 / 0.9);
    animation: pop 600ms ease 2;
  }

  /* The side columns: cards on the felt. */
  .side {
    display: grid;
    align-content: center;
    gap: 10px;
    min-width: 0;
  }
  .left {
    grid-area: left;
    justify-self: end;
    width: min(100%, 190px);
  }
  .right {
    grid-area: right;
    justify-self: start;
    width: min(100%, 210px);
  }
  .card {
    display: grid;
    gap: 6px;
    padding: 10px 12px;
    border-radius: 12px;
    background: rgb(4 10 22 / 0.7);
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.08);
  }
  .card h3 {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin: 0;
    font: 700 12px/1 var(--font-display);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #e8eef9;
  }
  .card h3 span {
    font: 600 11px/1 var(--font-ui);
    letter-spacing: 0.04em;
    text-transform: none;
    color: var(--muted);
  }

  /* The pay ladder: biggest catch first; the catch the draw is on lights green. */
  .pays ol {
    display: grid;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .pays li {
    display: flex;
    justify-content: space-between;
    padding: 4px 8px;
    border-radius: 6px;
    font: 13px/1.2 var(--font-ui);
    font-variant-numeric: tabular-nums;
    color: #bfd0ea;
    transition: background 160ms;
  }
  .pays li b {
    font: 700 14px/1.2 var(--font-display);
    color: #e8eef9;
  }
  .pays li.top b {
    color: var(--gold);
  }
  .pays li.now {
    background: linear-gradient(#2fbf6e, #17804a);
    color: #fff;
    box-shadow: 0 0 12px rgb(47 191 110 / 0.5);
  }
  .pays li.now b {
    color: #fff;
  }
  .hint {
    margin: 0;
    font: 11px/1.2 var(--font-ui);
    color: rgb(255 215 94 / 0.8);
  }

  /* The Gold Card: how much is stamped, and the two pots. */
  .goldcard {
    box-shadow: inset 0 0 0 1px rgb(232 192 106 / 0.35);
  }
  .goldcard h3 {
    color: var(--gold);
  }
  .goldcard .fill {
    height: 6px;
    border-radius: 3px;
    background: rgb(255 255 255 / 0.08);
    overflow: hidden;
  }
  .goldcard .fill i {
    display: block;
    width: calc(var(--f) * 100%);
    height: 100%;
    background: linear-gradient(90deg, #b8861e, #ffd75e);
    transition: width 400ms ease;
  }
  .goldcard .pot {
    display: flex;
    justify-content: space-between;
    font: 12px/1.3 var(--font-ui);
    color: #bfd0ea;
  }
  .goldcard .pot b {
    color: #fff;
    font-variant-numeric: tabular-nums;
  }
  .goldcard .pot.big b {
    color: var(--gold);
  }

  /* The pattern meters: each with its pattern drawn small, filling a pip at a time. */
  .meters {
    display: grid;
    gap: 6px;
  }
  .meter {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    grid-template-areas:
      'glyph name'
      'glyph pat'
      'pips pips';
    gap: 2px 8px;
    padding: 7px 10px;
    border-radius: 10px;
    background: rgb(4 10 22 / 0.7);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 30%, transparent);
  }
  .glyph {
    grid-area: glyph;
    width: 30px;
    height: 20px;
    align-self: center;
    fill: var(--c);
  }
  .meter .name {
    grid-area: name;
    font: 700 12px/1 var(--font-display);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--c);
  }
  .meter .pat {
    grid-area: pat;
    font: 11px/1.25 var(--font-ui);
    color: rgb(207 220 242 / 0.6);
  }
  .pips {
    grid-area: pips;
    display: flex;
    gap: 3px;
    margin-top: 4px;
  }
  .pips i {
    flex: 1;
    height: 6px;
    border-radius: 3px;
    background: rgb(255 255 255 / 0.1);
  }
  .pips i.on {
    background: var(--c);
    box-shadow: 0 0 6px color-mix(in srgb, var(--c) 60%, transparent);
  }
  .pips i.new {
    animation: pip 700ms ease 2;
  }
  @keyframes pip {
    50% {
      background: #fff;
      transform: scaleY(1.8);
    }
  }
  .meter.stepped {
    box-shadow:
      inset 0 0 0 1px var(--c),
      0 0 14px color-mix(in srgb, var(--c) 45%, transparent);
  }

  /* The buff running now: its colour, what it does, and the draws it has left. */
  .buffnow {
    display: grid;
    gap: 3px;
    padding: 10px 12px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--c) 18%, rgb(4 10 22 / 0.92));
    box-shadow:
      inset 0 0 0 1.5px var(--c),
      0 0 18px color-mix(in srgb, var(--c) 40%, transparent);
    animation: buffglow 1.6s ease-in-out infinite alternate;
  }
  .buffnow b {
    font: 700 16px/1 var(--font-display);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--c);
  }
  .buffnow span {
    font: 12px/1.3 var(--font-ui);
    color: #e8eef9;
  }
  .buffnow em {
    font: 700 13px/1.2 var(--font-ui);
    font-style: normal;
    color: #fff;
  }
  .buffnow small {
    font: 11px/1.2 var(--font-ui);
    color: rgb(207 220 242 / 0.7);
  }
  @keyframes buffglow {
    to {
      box-shadow:
        inset 0 0 0 1.5px var(--c),
        0 0 30px color-mix(in srgb, var(--c) 60%, transparent);
    }
  }

  /* A buff just earned: centre stage for a moment. */
  .earned {
    position: absolute;
    left: 50%;
    top: 34%;
    translate: -50% -50%;
    display: grid;
    gap: 8px;
    pointer-events: none;
    z-index: 3;
  }
  .earned div {
    display: grid;
    justify-items: center;
    gap: 4px;
    padding: 14px 26px;
    border-radius: 16px;
    background: rgb(4 10 22 / 0.92);
    box-shadow:
      0 0 0 2px var(--c),
      0 0 40px color-mix(in srgb, var(--c) 55%, transparent);
    text-align: center;
    animation: earned 3.2s ease forwards;
  }
  .earned span {
    font: 600 11px/1 var(--font-ui);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #bfd0ea;
  }
  .earned b {
    font: 700 clamp(26px, 6cqw, 44px) / 1 var(--font-display);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--c);
    text-shadow: 0 0 20px color-mix(in srgb, var(--c) 70%, transparent);
  }
  .earned small {
    font: 13px/1.3 var(--font-ui);
    color: #e8eef9;
  }
  @keyframes earned {
    0% {
      opacity: 0;
      scale: 0.6;
    }
    10% {
      opacity: 1;
      scale: 1.08;
    }
    16%,
    82% {
      opacity: 1;
      scale: 1;
    }
    100% {
      opacity: 0;
    }
  }


  /* The result, over the board for a moment. */
  .verdict {
    position: absolute;
    left: 50%;
    top: 52%;
    translate: -50% -50%;
    display: grid;
    justify-items: center;
    gap: 4px;
    padding: 14px 26px;
    border-radius: 16px;
    background: rgb(4 10 22 / 0.88);
    box-shadow:
      0 10px 30px rgb(0 0 0 / 0.5),
      inset 0 0 0 1px rgb(255 255 255 / 0.1);
    pointer-events: none;
    z-index: 2;
    animation: verdict 2.4s ease forwards;
  }
  .verdict span {
    font: 600 12px/1 var(--font-ui);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #bfd0ea;
  }
  .verdict b {
    font: 700 clamp(28px, 7cqw, 52px) / 1 var(--font-display);
    color: #8a9ab5;
  }
  .verdict .card-news {
    color: var(--gold);
    letter-spacing: 0.06em;
  }
  .verdict.long {
    animation-duration: 3.6s;
  }
  .verdict:not(.won) b {
    font-size: clamp(22px, 5cqw, 34px);
  }
  .verdict.won b {
    color: #8cf0b8;
    text-shadow: 0 0 18px rgb(140 240 184 / 0.6);
  }
  .verdict.gold {
    box-shadow:
      0 10px 30px rgb(0 0 0 / 0.5),
      0 0 0 2px #ffd75e,
      0 0 30px rgb(255 215 94 / 0.5);
  }
  .verdict.gold b {
    color: #ffd75e;
    text-shadow: 0 0 20px rgb(255 215 94 / 0.7);
  }
  @keyframes verdict {
    0% {
      opacity: 0;
      scale: 0.8;
    }
    12%,
    75% {
      opacity: 1;
      scale: 1;
    }
    100% {
      opacity: 0;
      scale: 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ball,
    .ball.gold,
    .cell.hit,
    .cell.out::before,
    .buffnow {
      animation: none;
    }
  }

  /* A tall, narrow felt (a phone): one column — the balls, the meters, the board, then the pays and the card. */
  @container (max-aspect-ratio: 1 / 1) {
    .keno {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto auto minmax(0, 1fr) auto;
      grid-template-areas: 'tray' 'right' 'board' 'left';
      justify-items: center;
      gap: 1.4cqh;
      padding: 1.4cqh 2cqw;
    }
    .tray {
      --ball: min(8cqw, 4.8cqh);
      grid-template-columns: repeat(10, var(--ball));
      border-radius: 18px;
    }
    .board {
      --cell: min(7.8cqw, 5.4cqh);
      grid-auto-rows: var(--cell);
    }
    .left,
    .right {
      justify-self: stretch;
      width: 100%;
    }
    .left {
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: start;
    }
    .meters {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .meter {
      padding: 5px 8px;
    }
    .meter .pat,
    .glyph {
      display: none;
    }
    .meter {
      grid-template-areas: 'name name' 'pips pips';
    }
    /* The pays in a row; the card as a compact block beside them. */
    .pays ol {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .pays li {
      flex-direction: column;
      align-items: center;
      padding: 3px 7px;
      font-size: 10px;
    }
    .pays h3,
    .hint {
      display: none;
    }
    .card {
      padding: 7px 9px;
    }
    .goldcard {
      min-width: 120px;
    }
    .buffnow {
      grid-template-columns: auto 1fr auto;
      align-items: baseline;
      gap: 2px 8px;
      padding: 6px 10px;
    }
    .buffnow span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .buffnow small {
      grid-column: 1 / -1;
    }
    /* A replay is of a past draw: the current pays and card step aside for its strip. */
    .keno.replaying .left {
      visibility: hidden;
    }
  }
</style>
