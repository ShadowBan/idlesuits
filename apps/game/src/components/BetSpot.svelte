<script lang="ts">
  import { formatMoney, type Decimal } from '../lib/money';
  import ChipStack from './ChipStack.svelte';

  interface Props {
    label: string;
    /** Chips on the spot. */
    amount: Decimal;
    /** How this spot settled: paid, taken, or pushed. Null while the hand is live. */
    net?: Decimal | null;
    /** The bet set for the next hand, when it differs from what is riding now. */
    next?: Decimal | null;
    /** Printed under the label on an empty spot: "= Ante", "2×". */
    hint?: string;
    size?: 'lg' | 'md' | 'sm';
    shape?: 'circle' | 'diamond';
    /** Tap adds a chip; a long press or right-click clears the spot. */
    onPlace?: () => void;
    onClear?: () => void;
    /** Draws the eye: the bet being decided, or the next move's spot. */
    active?: boolean;
    /** A live note pinned to the spot's edge while the hand plays: "4/5", "pays 10:1". */
    badge?: string;
    /** The badge is one card from paying. */
    hot?: boolean;
  }

  let {
    label,
    amount,
    net = null,
    next = null,
    hint,
    size = 'md',
    shape = 'circle',
    onPlace,
    onClear,
    active = false,
    badge,
    hot = false,
  }: Props = $props();

  const placeable = $derived(!!onPlace);
  const empty = $derived(amount.lte(0));
  const outcome = $derived(net === null ? null : net.gt(0) ? 'win' : net.lt(0) ? 'loss' : 'push');

  let pressTimer: ReturnType<typeof setTimeout> | undefined;
  let longPressed = false;
  function down() {
    longPressed = false;
    clearTimeout(pressTimer);
    if (onClear) {
      pressTimer = setTimeout(() => {
        longPressed = true;
        onClear?.();
      }, 450);
    }
  }
  function up() {
    clearTimeout(pressTimer);
  }
  function click() {
    if (longPressed) return;
    onPlace?.();
  }
  function context(e: MouseEvent) {
    if (!onClear) return;
    e.preventDefault();
    onClear();
  }
</script>

<div class="spot {size} {shape} {outcome ?? ''}" class:active class:empty class:placeable>
  <button
    type="button"
    class="ring"
    disabled={!placeable}
    aria-label={placeable ? `${label}: ${formatMoney(amount)}. Tap to add a chip, hold to clear.` : `${label}: ${formatMoney(amount)}`}
    onclick={click}
    onpointerdown={down}
    onpointerup={up}
    onpointerleave={up}
    oncontextmenu={context}
  >
    <span class="print">
      <span class="label">{label}</span>
      {#if hint && empty}<span class="hint">{hint}</span>{/if}
    </span>
    {#if !empty}
      <span class="chips" class:swept={outcome === 'loss'}><ChipStack {amount} /></span>
    {/if}
    {#if badge}
      {#key badge}<span class="badge" class:hot>{badge}</span>{/key}
    {/if}
  </button>

  {#if outcome === 'win' && net}
    <span class="payout"><ChipStack amount={net} /></span>
  {/if}

  <span class="tag">
    {#if outcome === 'win' && net}
      <b class="won">+{formatMoney(net)}</b>
    {:else if outcome === 'loss' && net}
      <b class="lost">{formatMoney(net)}</b>
    {:else if outcome === 'push' && !empty}
      <b>push</b>
    {:else if next && !next.eq(amount)}
      <span class="next">next {formatMoney(next)}</span>
    {:else if !empty}
      <span class="name">{label}</span> {formatMoney(amount)}
    {/if}
  </span>
</div>

<style>
  .spot {
    --ring: 62px;
    --chip: 40px;
    position: relative;
    display: grid;
    justify-items: center;
    gap: 2px;
    width: var(--ring);
  }
  .spot.lg {
    --ring: clamp(56px, 9cqmin, 76px);
    --chip: calc(var(--ring) * 0.62);
  }
  .spot.md {
    --ring: clamp(48px, 7.4cqmin, 64px);
    --chip: calc(var(--ring) * 0.62);
  }
  .spot.sm {
    --ring: clamp(40px, 6cqmin, 52px);
    --chip: calc(var(--ring) * 0.62);
  }
  .ring {
    position: relative;
    width: var(--ring);
    height: var(--ring);
    min-height: 0;
    padding: 0;
    border-radius: 50%;
    border: 2px solid var(--print);
    background: rgb(0 0 0 / 0.12);
    display: grid;
    place-items: center;
    cursor: default;
    transition:
      box-shadow 160ms ease,
      border-color 160ms ease;
  }
  /* A diamond is drawn as a turned square behind the spot, so chips inside stay upright. */
  .diamond .ring {
    border-color: transparent;
    background: none;
    border-radius: 0;
  }
  .diamond .ring::before {
    content: '';
    position: absolute;
    inset: 12%;
    border: 2px solid var(--print);
    border-radius: 12%;
    background: rgb(0 0 0 / 0.12);
    transform: rotate(45deg);
    transition: inherit;
  }
  .diamond.placeable .ring:hover::before,
  .diamond.active .ring::before {
    border-color: var(--gold);
  }
  .diamond.win .ring::before {
    border-color: var(--win);
  }
  .diamond .ring:hover,
  .diamond.win .ring,
  .diamond.active .ring {
    box-shadow: none;
  }
  .placeable .ring {
    cursor: pointer;
  }
  .placeable .ring:hover {
    border-color: var(--gold);
    box-shadow: 0 0 0 3px rgb(232 182 76 / 0.18);
  }
  .ring:disabled {
    opacity: 1;
  }
  .active .ring {
    border-color: var(--gold);
    box-shadow:
      0 0 0 3px rgb(232 182 76 / 0.25),
      0 0 18px rgb(232 182 76 / 0.45);
  }
  .win .ring {
    border-color: var(--win);
    box-shadow: 0 0 16px rgb(107 224 143 / 0.45);
  }
  .print {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 1px;
    pointer-events: none;
  }
  .label {
    font: 700 calc(var(--ring) * 0.17) / 1 var(--font-display);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--print);
  }
  .hint {
    font: 600 calc(var(--ring) * 0.13) / 1 var(--font-ui);
    color: var(--print);
    opacity: 0.8;
  }
  /* Chips cover the printed label, so it moves to the line under the spot. */
  .spot:not(.empty) .print {
    opacity: 0;
  }
  /* Once a lost bet is swept away, the printing shows through again. */
  .spot.loss .print {
    animation: reprint 300ms ease 700ms forwards;
  }
  @keyframes reprint {
    to {
      opacity: 1;
    }
  }
  .chips {
    position: absolute;
    left: 50%;
    bottom: calc(var(--ring) * 0.16);
    transform: translateX(-50%);
  }
  .swept {
    animation: swept 520ms ease-in 260ms forwards;
  }
  @keyframes swept {
    to {
      transform: translate(-50%, -120%) scale(0.85);
      opacity: 0;
    }
  }
  /* A win: the bet slides left and the payout is set down beside it, both inside the circle. */
  .win .chips {
    transform: translateX(calc(-50% - var(--ring) * 0.2));
    transition: transform 260ms ease;
  }
  .payout {
    position: absolute;
    left: calc(50% - var(--chip) / 2 + var(--ring) * 0.2);
    bottom: calc(14px + var(--ring) * 0.16);
    animation: paid 420ms cubic-bezier(0.2, 0.8, 0.3, 1.2) both;
    pointer-events: none;
  }
  @keyframes paid {
    from {
      transform: translate(10px, -60%);
      opacity: 0;
    }
  }
  /* Fixed box, text centred and free to spill: a changing amount never nudges the spot. */
  .tag {
    width: 100%;
    height: 12px;
    display: flex;
    justify-content: center;
    gap: 3px;
    font: 600 10px/12px var(--font-ui);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    color: var(--ink);
    opacity: 0.85;
  }
  .tag b {
    font-weight: 700;
  }
  .won {
    color: var(--win);
  }
  .lost {
    color: var(--loss);
  }
  .next {
    color: var(--gold);
  }
  .name {
    font: 700 8px/12px var(--font-ui);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--print);
  }
  /* Small spots sit close together: their amount alone, the name stays printed on the ring. */
  .sm .name {
    display: none;
  }
  /* Pinned over the top-right edge: never part of the layout. */
  .badge {
    position: absolute;
    top: -6px;
    right: -10px;
    z-index: 2;
    padding: 3px 5px;
    border-radius: 999px;
    background: var(--felt-deep);
    border: 1px solid var(--print);
    font: 700 9px/1 var(--font-ui);
    font-variant-numeric: tabular-nums;
    color: var(--ink);
    white-space: nowrap;
    pointer-events: none;
    animation: badge-in 220ms ease-out;
  }
  .badge.hot {
    border-color: var(--gold);
    color: var(--gold);
    box-shadow: 0 0 10px rgb(232 182 76 / 0.6);
  }
  @keyframes badge-in {
    from {
      transform: scale(1.5);
    }
  }
</style>
