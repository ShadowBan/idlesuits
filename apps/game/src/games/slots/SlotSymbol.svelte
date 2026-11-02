<script lang="ts">
  import type { CoinValue } from '@idlesuits/sim';

  interface Props {
    id: string;
    /** What a coin carries, already written for the bet: "$25", "MINI". */
    label?: string;
    /** A coin's value, for its colour. */
    coin?: CoinValue;
  }

  let { id, label, coin }: Props = $props();
  // Each symbol's gradients get ids of their own: a reel shows many symbols at once.
  const uid = $props.id();

  const ROYAL: Record<string, string> = { A: '#ff5d6c', K: '#5aa9ff', Q: '#c08cff', J: '#5fe08a', '10': '#ffb04c' };
  const TIER_COLOR = { mini: '#7ad8ff', minor: '#8cf08a', major: '#ff6b8b', grand: '#ffd75e' } as const;
  const tint = $derived(coin?.kind === 'jackpot' ? TIER_COLOR[coin.tier] : '#fff3c4');
</script>

<!--
  Midnight Vault's symbols, drawn as SVG so they stay sharp at any reel size.
  The royals are letters; the coin carries its value.
-->
<svg class="symbol" viewBox="0 0 100 100" role="img" aria-label={label ? `${id} ${label}` : id}>
  {#if id in ROYAL}
    <text x="50" y="68" text-anchor="middle" class="royal" fill={ROYAL[id]} font-size={id === '10' ? 46 : 58}>{id}</text>
  {:else if id === 'bar'}
    <defs>
      <linearGradient id="bar-{uid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff1a8" />
        <stop offset="0.5" stop-color="#f2c64e" />
        <stop offset="1" stop-color="#a8781c" />
      </linearGradient>
    </defs>
    <path d="M22 58 L32 42 H68 L78 58 Z" fill="url(#bar-{uid})" stroke="#6b4a10" stroke-width="2" />
    <path d="M14 80 L24 62 H52 L62 80 Z" fill="url(#bar-{uid})" stroke="#6b4a10" stroke-width="2" />
    <path d="M44 80 L54 62 H76 L86 80 Z" fill="url(#bar-{uid})" stroke="#6b4a10" stroke-width="2" />
    <path d="M34 45 H60" stroke="#fff8d6" stroke-width="2" opacity="0.8" />
  {:else if id === 'gem'}
    <path d="M30 26 H70 L86 44 L50 86 L14 44 Z" fill="#4fd8ff" stroke="#0d5f7a" stroke-width="2" />
    <path d="M14 44 H86 M30 26 L40 44 L50 86 L60 44 L70 26 M40 44 L50 26 L60 44" fill="none" stroke="#0d5f7a" stroke-width="1.6" />
    <path d="M30 26 L40 44 L14 44 Z" fill="#b8f3ff" opacity="0.7" />
  {:else if id === 'bag'}
    <path d="M38 30 Q50 22 62 30 L56 38 H44 Z" fill="#3e9b52" stroke="#164d22" stroke-width="2" />
    <path d="M44 38 H56 Q84 52 78 74 Q72 88 50 88 Q28 88 22 74 Q16 52 44 38 Z" fill="#4cb563" stroke="#164d22" stroke-width="2" />
    <path d="M42 37 H58" stroke="#c49a3a" stroke-width="4" stroke-linecap="round" />
    <text x="50" y="76" text-anchor="middle" class="mark" fill="#e9ffd9" font-size="30">$</text>
  {:else if id === 'key'}
    <circle cx="32" cy="50" r="17" fill="none" stroke="#f2c64e" stroke-width="8" />
    <path d="M47 50 H88 M74 50 V64 M84 50 V60" stroke="#f2c64e" stroke-width="8" stroke-linecap="round" />
    <circle cx="32" cy="50" r="17" fill="none" stroke="#8a6214" stroke-width="1.5" />
  {:else if id === 'wild'}
    <rect x="8" y="24" width="84" height="52" rx="10" fill="#6c3fd1" stroke="#f2c64e" stroke-width="3" />
    <text x="50" y="61" text-anchor="middle" class="wild" fill="#ffe28a" font-size="27">WILD</text>
  {:else if id === 'coin'}
    <defs>
      <radialGradient id="coin-{uid}" cx="0.35" cy="0.3" r="0.8">
        <stop offset="0" stop-color="#fff5c2" />
        <stop offset="0.55" stop-color="#f2c64e" />
        <stop offset="1" stop-color="#9a6a12" />
      </radialGradient>
    </defs>
    <circle cx="50" cy="50" r="42" fill="url(#coin-{uid})" stroke="#6b4a10" stroke-width="2" />
    <circle cx="50" cy="50" r="34" fill="none" stroke="#8a6214" stroke-width="1.5" stroke-dasharray="3 3" />
    {#if label}
      <text x="50" y="58" text-anchor="middle" class="value" fill={coin?.kind === 'jackpot' ? '#2a1745' : '#4a2f05'} font-size={label.length > 5 ? 18 : 23}>{label}</text>
      {#if coin?.kind === 'jackpot'}<circle cx="50" cy="50" r="42" fill="none" stroke={tint} stroke-width="5" />{/if}
    {/if}
  {/if}
</svg>

<style>
  .symbol {
    width: 100%;
    height: 100%;
    display: block;
    overflow: visible;
  }
  .royal,
  .wild,
  .mark,
  .value {
    font-family: var(--font-display);
    font-weight: 700;
  }
  .royal {
    stroke: rgb(0 0 0 / 0.55);
    stroke-width: 2.5;
    paint-order: stroke;
  }
</style>
