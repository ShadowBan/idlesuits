<script lang="ts">
  import { layoutNumber, pocketColor, rouletteBet } from '@idlesuits/sim';
  import Chip from '../../components/Chip.svelte';
  import { chipIndexAtMost, chipValue } from '../../lib/chips';
  import { formatMoney, type Decimal } from '../../lib/money';

  interface Props {
    /** The chips on each bet. */
    layout: Record<string, Decimal>;
    /** Each bet's result on the spin just settled: won (> 0) or lost (< 0). */
    results: Record<string, number>;
    /** The number the ball landed on, once it has. */
    winning: number | null;
    /** Upright, for a phone: zero at the top, the outside bets down the side. */
    vertical?: boolean;
    disabled?: boolean;
    onPlace: (id: string) => void;
    /** Takes the chips off a bet (right-click, or a long press). */
    onTake?: (id: string) => void;
  }

  let { layout, results, winning, vertical = false, disabled = false, onPlace, onTake }: Props = $props();

  /*
   * The layout in its own units, lying flat: zero's column (1 wide), twelve
   * columns of numbers (1 × 1 each) and the column bets, over the dozens and
   * the even-money bets. Upright, x and y swap.
   */
  const W = 14;
  const H = 4.2;
  const E = 0.17;

  interface Zone {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    /** On top of the number cells: edges and corners. */
    small: boolean;
  }

  const zones: Zone[] = (() => {
    const out: Zone[] = [];
    const add = (id: string, x: number, y: number, w: number, h: number, small = true) => {
      if (rouletteBet(id)) out.push({ id, x, y, w, h, small });
    };
    const ids = (...ns: number[]) => [...ns].sort((a, b) => a - b).join('-');
    add('0', 0, 0, 1 - E, 3, false);
    for (let c = 0; c < 12; c++) {
      for (let r = 0; r < 3; r++) {
        const n = layoutNumber(c, r);
        add(String(n), 1 + c + E, r + E, 1 - 2 * E, 1 - 2 * E, false);
        // Split with the number to the right, and with the one below.
        if (c < 11) add(ids(n, n + 3), 2 + c - E, r + E, 2 * E, 1 - 2 * E);
        if (r < 2) add(ids(n, n - 1), 1 + c + E, r + 1 - E, 1 - 2 * E, 2 * E);
        // Corner with the numbers right and below.
        if (c < 11 && r < 2) add(ids(n - 1, n, n + 2, n + 3), 2 + c - E, r + 1 - E, 2 * E, 2 * E);
      }
      // Along the bottom edge: the street, and the six line where two streets meet.
      const low = c * 3 + 1;
      add(ids(low, low + 1, low + 2), 1 + c + E, 3 - E, 1 - 2 * E, 2 * E);
      if (c < 11) add(ids(low, low + 1, low + 2, low + 3, low + 4, low + 5), 2 + c - E, 3 - E, 2 * E, 2 * E);
    }
    // Zero with its neighbours: splits, the trios, and the first four at the foot.
    for (let r = 0; r < 3; r++) add(ids(0, 3 - r), 1 - E, r + E, 2 * E, 1 - 2 * E);
    add('0-2-3', 1 - E, 1 - E, 2 * E, 2 * E);
    add('0-1-2', 1 - E, 2 - E, 2 * E, 2 * E);
    add('0-1-2-3', 1 - E, 3 - E, 2 * E, 2 * E);
    // The outside bets.
    for (let r = 0; r < 3; r++) add(`column${3 - r}`, 13, r, 1, 1, false);
    for (let k = 0; k < 3; k++) add(`dozen${k + 1}`, 1 + 4 * k, 3, 4, 0.6, false);
    ['low', 'even', 'red', 'black', 'odd', 'high'].forEach((id, k) => add(id, 1 + 2 * k, 3.6, 2, 0.6, false));
    return out;
  })();

  /** The number cells, drawn under the zones. */
  const cells = Array.from({ length: 36 }, (_, i) => {
    const c = Math.floor(i / 3);
    const r = i % 3;
    return { n: layoutNumber(c, r), x: 1 + c, y: r };
  });

  /** Places a box given in flat units, upright or not, as percentages of the board. */
  function box(x: number, y: number, w: number, h: number): string {
    // Upright, the layout turns so zero is at the top and 1, 2, 3 read left to right, the outside bets down the left.
    const [bx, by, bw, bh, tw, th] = vertical ? [H - y - h, x, h, w, H, W] : [x, y, w, h, W, H];
    return `left:${(bx / tw) * 100}%;top:${(by / th) * 100}%;width:${(bw / tw) * 100}%;height:${(bh / th) * 100}%`;
  }

  let hover = $state<string | null>(null);
  const lit = $derived(new Set(hover ? (rouletteBet(hover)?.numbers ?? []) : []));

  const OUTSIDE: Record<string, string> = {
    column1: '2:1',
    column2: '2:1',
    column3: '2:1',
    dozen1: '1st 12',
    dozen2: '2nd 12',
    dozen3: '3rd 12',
    low: '1–18',
    even: 'Even',
    red: '',
    black: '',
    odd: 'Odd',
    high: '19–36',
  };

  /** The chip that shows a bet: the biggest that fits in it, with the amount when it's not exactly one chip. */
  function chipOf(amount: Decimal) {
    const index = Math.max(0, chipIndexAtMost(amount));
    return { index, exact: chipValue(index).eq(amount) };
  }
</script>

<div class="board" class:vertical class:disabled style:aspect-ratio={vertical ? `${H} / ${W}` : `${W} / ${H}`} role="group" aria-label="Roulette layout">
  <!-- Zero, the numbers and the outside boxes, as painted on the felt. -->
  <div class="cell zero green" class:lit={lit.has(0)} class:win={winning === 0} style={box(0, 0, 1, 3)}><span>0</span></div>
  {#each cells as cell (cell.n)}
    <div class="cell {pocketColor(cell.n)}" class:lit={lit.has(cell.n)} class:win={winning === cell.n} style={box(cell.x, cell.y, 1, 1)}>
      <span>{cell.n}</span>
    </div>
  {/each}
  {#each zones.filter((z) => !z.small && rouletteBet(z.id)!.kind !== 'straight') as z (z.id)}
    <div class="cell outside" class:lit={hover === z.id} class:won={(results[z.id] ?? 0) > 0} style={box(z.x, z.y, z.w, z.h)}>
      {#if z.id === 'red' || z.id === 'black'}
        <i class="diamond {z.id}"></i>
      {:else}
        <span>{OUTSIDE[z.id]}</span>
      {/if}
    </div>
  {/each}

  <!-- Where a chip can go: every bet's spot, edges and corners above the cells. -->
  {#each zones as z (z.id)}
    <button
      type="button"
      class="zone"
      class:small={z.small}
      style={box(z.x, z.y, z.w, z.h)}
      aria-label={rouletteBet(z.id)!.label}
      {disabled}
      onclick={() => onPlace(z.id)}
      oncontextmenu={(e) => {
        e.preventDefault();
        onTake?.(z.id);
      }}
      onpointerenter={() => (hover = z.id)}
      onpointerleave={() => hover === z.id && (hover = null)}
      onfocus={() => (hover = z.id)}
      onblur={() => hover === z.id && (hover = null)}
    ></button>
  {/each}

  <!-- The chips, on their bets' spots. -->
  {#each zones.filter((z) => layout[z.id]?.gt(0)) as z (z.id)}
    {@const amount = layout[z.id]!}
    {@const chip = chipOf(amount)}
    {@const r = results[z.id]}
    <div class="chip" class:won={r !== undefined && r > 0} class:lost={r !== undefined && r < 0} style={box(z.x + z.w / 2, z.y + z.h / 2, 0, 0)}>
      <Chip index={chip.index} />
      {#if !chip.exact}<small>{formatMoney(amount)}</small>{/if}
    </div>
  {/each}
</div>

<style>
  .board {
    --u: 1cqmin;
    position: relative;
    width: 100%;
    max-height: 100%;
    margin: 0 auto;
    container-type: inline-size;
    border-radius: 6px;
    box-shadow: 0 0 0 2px rgb(255 240 200 / 0.75);
    user-select: none;
    -webkit-user-select: none;
    touch-action: manipulation;
  }
  .cell {
    position: absolute;
    display: grid;
    place-items: center;
    box-shadow: inset 0 0 0 1px rgb(255 240 200 / 0.75);
    color: #fff8ec;
    font: 700 3.1cqw/1 var(--font-display);
    transition: background 120ms;
  }
  .vertical .cell {
    font-size: 7.4cqw;
  }
  .cell span {
    display: grid;
    place-items: center;
    width: 64%;
    aspect-ratio: 1;
    max-height: 80%;
    border-radius: 50%;
  }
  .cell.red span {
    background: #c62a36;
  }
  .cell.black span {
    background: #17171d;
  }
  .cell.green {
    background: #1d8a4e;
    border-radius: 999px 0 0 999px / 50% 0 0 50%;
  }
  .vertical .cell.green {
    border-radius: 50% 50% 0 0 / 999px 999px 0 0;
  }
  .cell.zero span {
    width: auto;
    aspect-ratio: auto;
    background: none;
  }
  .cell.outside {
    font: 600 2.2cqw/1 var(--font-ui);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .vertical .cell.outside {
    font-size: 4.6cqw;
  }
  .vertical .cell.outside span {
    writing-mode: vertical-rl;
    width: auto;
    aspect-ratio: auto;
  }
  .cell.outside span {
    width: auto;
    aspect-ratio: auto;
  }
  .diamond {
    width: 34%;
    aspect-ratio: 1.6;
    clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
  }
  .vertical .diamond {
    width: 46%;
    aspect-ratio: 0.62;
  }
  .diamond.red {
    background: #c62a36;
  }
  .diamond.black {
    background: #17171d;
  }
  .cell.lit {
    background: rgb(255 240 200 / 0.22);
  }
  .cell.green.lit {
    background: #2bb067;
  }
  .cell.win {
    background: rgb(255 215 94 / 0.35);
    animation: glow 1s ease-in-out infinite alternate;
  }
  .cell.outside.won {
    background: rgb(140 240 184 / 0.18);
  }
  @keyframes glow {
    to {
      background: rgb(255 215 94 / 0.6);
    }
  }

  .zone {
    position: absolute;
    min-height: 0;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: none;
    cursor: pointer;
    z-index: 1;
  }
  .zone.small {
    z-index: 2;
  }
  .zone:hover:not(:disabled),
  .zone:focus-visible {
    background: rgb(255 255 255 / 0.12);
    outline: none;
  }
  .zone.small:hover:not(:disabled) {
    background: rgb(255 215 94 / 0.55);
    border-radius: 50%;
  }
  .zone:disabled {
    opacity: 1;
    cursor: default;
  }

  .chip {
    position: absolute;
    z-index: 3;
    pointer-events: none;
    display: grid;
    justify-items: center;
  }
  .chip :global(.chip) {
    width: 4.4cqw;
    height: 4.4cqw;
    translate: -50% -50%;
    filter: drop-shadow(0 2px 2px rgb(0 0 0 / 0.6));
  }
  .vertical .chip :global(.chip) {
    width: 9.5cqw;
    height: 9.5cqw;
  }
  .chip small {
    position: absolute;
    top: 1.6cqw;
    translate: -50% 0;
    padding: 1px 4px;
    border-radius: 4px;
    background: rgb(0 0 0 / 0.75);
    color: #fff;
    font: 600 1.5cqw/1.2 var(--font-ui);
    white-space: nowrap;
  }
  .vertical .chip small {
    top: 3.6cqw;
    font-size: 3.4cqw;
  }
  .chip.won :global(.chip) {
    filter: drop-shadow(0 0 6px #8cf0b8) drop-shadow(0 2px 2px rgb(0 0 0 / 0.6));
    animation: bump 600ms ease;
  }
  .chip.lost {
    opacity: 0.35;
    transition: opacity 600ms;
  }
  @keyframes bump {
    40% {
      scale: 1.25;
    }
  }
</style>
