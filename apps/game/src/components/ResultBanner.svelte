<script lang="ts">
  import { chipIndexAtMost } from '../lib/chips';
  import { formatMoney, type Decimal } from '../lib/money';
  import Chip from './Chip.svelte';

  interface Props {
    /** "You win", "Dealer wins", "Push", "Folded". */
    title: string;
    /** Net for the round, side bets included. */
    net: Decimal;
    /** One line on why: "Pair of kings beats pair of nines". */
    detail?: string;
    /** A win worth celebrating: chips burst out behind the banner. */
    big?: boolean;
  }

  let { title, net, detail, big = false }: Props = $props();

  const tone = $derived(net.gt(0) ? 'win' : net.lt(0) ? 'loss' : 'push');
  /**
   * When the side bets swing the round against the hand, say so: not "Dealer wins +$20" or "You win −$5".
   * The hand's own result moves to the line underneath.
   */
  const heading = $derived.by(() => {
    if (net.gt(0) && /^(Dealer wins|Folded|No pay|Push)/.test(title)) return 'Side bets pay';
    if (!net.gt(0) && /^(You win|Pays)/.test(title)) return net.eq(0) ? 'Even' : 'Side bets cost';
    return title;
  });
  const line = $derived(heading === title ? detail : [title, detail].filter(Boolean).join(' · '));
  const burstChip = $derived(Math.max(0, chipIndexAtMost(net.abs().div(4))));
  const BURST = Array.from({ length: 12 }, (_, i) => ({
    angle: (i / 12) * 360 + (i % 2) * 12,
    reach: 70 + (i % 3) * 26,
    delay: (i % 4) * 30,
  }));
</script>

<!-- Floats over the felt: appearing and leaving never moves anything on the table. -->
<div class="banner {tone}" class:big role="status">
  {#if big}
    <div class="burst" aria-hidden="true">
      {#each BURST as b, i (i)}
        <span style:--a="{b.angle}deg" style:--r="{b.reach}px" style:--d="{b.delay}ms"><Chip index={burstChip} label={false} /></span>
      {/each}
    </div>
  {/if}
  <p class="title">{heading} <b>{formatMoney(net, true)}</b></p>
  {#if line}<p class="detail">{line}</p>{/if}
</div>

<style>
  .banner {
    position: absolute;
    left: 50%;
    top: var(--banner-top, 50%);
    z-index: 3;
    transform: translate(-50%, -50%);
    display: grid;
    justify-items: center;
    gap: 3px;
    max-width: calc(100% - 24px);
    padding: 8px 18px 9px;
    border-radius: 14px;
    background: rgb(6 22 16 / 0.82);
    border: 1px solid rgb(255 255 255 / 0.1);
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.45);
    backdrop-filter: blur(2px);
    pointer-events: none;
    animation: pop 340ms cubic-bezier(0.2, 0.9, 0.3, 1.3) both;
  }
  @keyframes pop {
    from {
      transform: translate(-50%, -50%) scale(0.6);
      opacity: 0;
    }
  }
  .title {
    margin: 0;
    font: 700 20px/1.05 var(--font-display);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    white-space: nowrap;
  }
  .detail {
    margin: 0;
    font: 500 12px/1.3 var(--font-ui);
    color: var(--muted);
    text-align: center;
  }
  .win .title {
    color: var(--win);
  }
  .loss .title {
    color: var(--loss);
  }
  .push .title {
    color: var(--ink);
  }
  .big {
    border-color: rgb(232 182 76 / 0.6);
    box-shadow:
      0 0 0 1px rgb(232 182 76 / 0.4),
      0 0 40px rgb(232 182 76 / 0.45);
  }
  .big .title {
    font-size: 26px;
    color: var(--gold);
    text-shadow: 0 0 18px rgb(232 182 76 / 0.7);
  }
  .burst {
    position: absolute;
    left: 50%;
    top: 50%;
    z-index: -1;
  }
  .burst span {
    --chip: 22px;
    position: absolute;
    left: -11px;
    top: -11px;
    animation: fly 900ms cubic-bezier(0.1, 0.7, 0.3, 1) var(--d) both;
  }
  @keyframes fly {
    from {
      transform: rotate(var(--a)) translateX(0) rotate(0deg);
      opacity: 1;
    }
    to {
      transform: rotate(var(--a)) translateX(var(--r)) rotate(240deg);
      opacity: 0;
    }
  }
  /* Landscape phones have no free felt: the banner lands over the cards, so it says its piece and clears. */
  @media (orientation: landscape) and (max-height: 520px) {
    .banner {
      animation:
        pop 340ms cubic-bezier(0.2, 0.9, 0.3, 1.3) both,
        clear 450ms ease-in 2.2s forwards;
    }
  }
  @keyframes clear {
    to {
      transform: translate(-50%, -50%) scale(0.92);
      opacity: 0;
    }
  }
  @media (max-width: 420px) {
    .title {
      font-size: 17px;
    }
    .big .title {
      font-size: 21px;
    }
  }
</style>
