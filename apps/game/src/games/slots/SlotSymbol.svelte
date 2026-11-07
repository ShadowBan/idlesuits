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
  /** Lucky Forge's horseshoes: light, mid and dark of each metal. */
  const SHOE: Record<string, [string, string, string]> = {
    bronze: ['#f2b07a', '#c27a3a', '#6b3a12'],
    silver: ['#ffffff', '#b8c2d0', '#4a5260'],
    gold: ['#fff1a8', '#f2c64e', '#8a5a0c'],
  };
  const tint = $derived(coin?.kind === 'jackpot' ? TIER_COLOR[coin.tier] : '#fff3c4');
</script>

<!--
  Every machine's symbols, drawn as SVG so they stay sharp at any reel size.
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
  {:else if id in SHOE}
    <!-- Lucky Forge's metals: a horseshoe in bronze, silver or gold. -->
    {@const m = SHOE[id]!}
    <defs>
      <linearGradient id="shoe-{uid}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color={m[0]} />
        <stop offset="0.5" stop-color={m[1]} />
        <stop offset="1" stop-color={m[2]} />
      </linearGradient>
    </defs>
    <path d="M24 86 L20 52 Q18 18 50 16 Q82 18 80 52 L76 86 H62 L64 54 Q66 32 50 31 Q34 32 36 54 L38 86 Z" fill="url(#shoe-{uid})" stroke={m[2]} stroke-width="2.5" />
    {#each [[27, 70], [25, 50], [32, 30], [73, 70], [75, 50], [68, 30]] as [x, y] (`${x}${y}`)}
      <circle cx={x} cy={y} r="3" fill={m[2]} />
    {/each}
  {:else if id === 'crown'}
    <path d="M14 74 L18 32 L36 52 L50 22 L64 52 L82 32 L86 74 Z" fill="#f2c64e" stroke="#7a4f0c" stroke-width="2.5" />
    <rect x="14" y="72" width="72" height="12" rx="3" fill="#d9a630" stroke="#7a4f0c" stroke-width="2.5" />
    <circle cx="50" cy="62" r="8" fill="#e8344f" stroke="#7a0f20" stroke-width="2" />
    <circle cx="30" cy="64" r="5" fill="#4fd8ff" stroke="#0d5f7a" stroke-width="1.5" />
    <circle cx="70" cy="64" r="5" fill="#4fd8ff" stroke="#0d5f7a" stroke-width="1.5" />
    {#each [18, 50, 82] as x, i (x)}<circle cx={x} cy={i === 1 ? 22 : 32} r="5" fill="#fff1a8" stroke="#7a4f0c" stroke-width="1.5" />{/each}
  {:else if id === 'anvil'}
    <path d="M10 30 H74 Q90 30 92 44 Q80 42 72 46 L66 54 H34 L30 46 Q14 44 10 30 Z" fill="#59606e" stroke="#1d2129" stroke-width="2.5" />
    <path d="M38 54 H62 L66 74 H76 V84 H24 V74 H34 Z" fill="#454b57" stroke="#1d2129" stroke-width="2.5" />
    <path d="M14 32 H72" stroke="#aab3c2" stroke-width="2" />
    <text x="50" y="47" text-anchor="middle" class="mark" fill="#ffb04c" font-size="11" letter-spacing="1">BONUS</text>
    <path d="M78 18 l4 -8 M86 24 l8 -4 M70 16 l-2 -8" stroke="#ffb04c" stroke-width="3" stroke-linecap="round" />
  {:else if id === 'hammer'}
    <rect x="45" y="36" width="10" height="54" rx="4" fill="#9a6a3a" stroke="#4a2c12" stroke-width="2" transform="rotate(-30 50 50)" />
    <rect x="20" y="14" width="56" height="24" rx="5" fill="#8c95a6" stroke="#2a2f38" stroke-width="2.5" transform="rotate(-30 50 50)" />
    <path d="M24 20 H72" stroke="#d8dee8" stroke-width="2" transform="rotate(-30 50 50)" />
    <circle cx="74" cy="74" r="6" fill="#ffb04c" opacity="0.9" />
    <circle cx="84" cy="62" r="3.5" fill="#ffd75e" />
  {:else if id === 'ship'}
    <path d="M14 62 H86 L76 82 H24 Z" fill="#7a4a24" stroke="#3a200c" stroke-width="2.5" />
    <path d="M50 14 V62" stroke="#3a200c" stroke-width="3" />
    <path d="M52 18 Q76 30 52 44 Z M52 46 Q80 54 52 60 Z" fill="#f4ead2" stroke="#8a7a5a" stroke-width="1.5" />
    <path d="M48 22 Q28 34 48 50 Z" fill="#f4ead2" stroke="#8a7a5a" stroke-width="1.5" />
    <path d="M50 14 L62 10 L50 8 Z" fill="#e8344f" />
    <path d="M10 86 Q22 80 34 86 T58 86 T82 86 T92 84" fill="none" stroke="#4fb8e8" stroke-width="3" />
  {:else if id === 'parrot'}
    <path d="M58 22 Q80 26 76 52 Q72 80 50 88 Q42 70 40 52 Q38 28 58 22 Z" fill="#e8344f" stroke="#7a0f20" stroke-width="2" />
    <path d="M44 56 Q30 70 34 88 L50 88 Q46 70 52 58 Z" fill="#4c7ae8" stroke="#1a2f7a" stroke-width="2" />
    <path d="M48 62 Q40 72 44 84" fill="none" stroke="#5fe08a" stroke-width="4" />
    <path d="M62 30 Q78 30 80 42 Q72 38 66 42 Z" fill="#ffd75e" stroke="#7a5a0c" stroke-width="1.5" />
    <circle cx="60" cy="34" r="4" fill="#fff" /><circle cx="61" cy="34" r="2" fill="#111" />
  {:else if id === 'chest'}
    <path d="M16 46 Q16 22 50 22 Q84 22 84 46 Z" fill="#9a5a24" stroke="#3a200c" stroke-width="2.5" />
    <rect x="16" y="46" width="68" height="36" rx="3" fill="#8a4a1c" stroke="#3a200c" stroke-width="2.5" />
    <path d="M16 46 H84 M32 24 V82 M68 24 V82" stroke="#f2c64e" stroke-width="4" />
    <rect x="44" y="40" width="12" height="16" rx="2" fill="#f2c64e" stroke="#6b4a10" stroke-width="1.5" />
    <circle cx="30" cy="20" r="4" fill="#fff1a8" /><circle cx="70" cy="18" r="3" fill="#fff1a8" />
  {:else if id === 'compass'}
    <circle cx="50" cy="50" r="36" fill="#f4ead2" stroke="#8a6214" stroke-width="5" />
    <path d="M50 18 L58 50 L50 82 L42 50 Z" fill="#e8344f" stroke="#7a0f20" stroke-width="1.5" />
    <path d="M50 50 L58 50 L50 82 L42 50 Z" fill="#2a3a5a" />
    <path d="M18 50 L50 44 L82 50 L50 56 Z" fill="#8a7a5a" opacity="0.6" />
    <circle cx="50" cy="50" r="4" fill="#f2c64e" />
  {:else if id === 'captain'}
    <!-- The collector: a captain's tricorn and grin. -->
    <circle cx="50" cy="58" r="26" fill="#f2c9a0" stroke="#7a4a24" stroke-width="2" />
    <path d="M10 44 Q50 4 90 44 Q70 36 50 40 Q30 36 10 44 Z" fill="#1d1d2a" stroke="#f2c64e" stroke-width="3" />
    <path d="M42 26 L50 18 L58 26 L50 34 Z" fill="#fff" />
    <path d="M30 52 H46 M54 52 H70" stroke="#111" stroke-width="3" />
    <path d="M56 46 H72 V58 H56 Z" fill="#111" />
    <path d="M36 70 Q50 80 64 70" fill="none" stroke="#7a2a12" stroke-width="3" stroke-linecap="round" />
    <path d="M28 74 Q36 90 50 90 Q64 90 72 74 Q60 84 50 84 Q40 84 28 74 Z" fill="#6b3a1a" />
  {:else if id === 'map'}
    <path d="M14 20 L36 14 L62 22 L86 16 V80 L62 86 L36 78 L14 84 Z" fill="#f2deb0" stroke="#8a6a3a" stroke-width="2.5" />
    <path d="M36 14 V78 M62 22 V86" stroke="#c9a870" stroke-width="1.5" />
    <path d="M22 70 Q30 50 44 56 T66 40" fill="none" stroke="#7a4a24" stroke-width="2.5" stroke-dasharray="4 3" />
    <path d="M64 32 L74 42 M74 32 L64 42" stroke="#e8344f" stroke-width="4" stroke-linecap="round" />
    <text x="50" y="96" text-anchor="middle" class="mark" fill="#ffd75e" font-size="12" letter-spacing="1">BONUS</text>
  {:else if id === 'hat'}
    <path d="M30 20 H70 L68 70 H32 Z" fill="#1d1d2a" stroke="#c08cff" stroke-width="2" />
    <rect x="30" y="58" width="40" height="9" fill="#e8344f" />
    <ellipse cx="50" cy="74" rx="38" ry="9" fill="#2a2a3a" stroke="#c08cff" stroke-width="2" />
    <path d="M36 24 V54" stroke="#4a4a64" stroke-width="3" />
  {:else if id === 'lion'}
    <circle cx="50" cy="52" r="36" fill="#d9822b" stroke="#7a3a0c" stroke-width="2" />
    <circle cx="50" cy="54" r="22" fill="#f2b84e" />
    <circle cx="42" cy="48" r="3.5" fill="#2a1505" /><circle cx="58" cy="48" r="3.5" fill="#2a1505" />
    <path d="M44 60 L50 66 L56 60 Z" fill="#5a2a0c" />
    <path d="M50 66 V70 M42 70 Q50 76 58 70" fill="none" stroke="#5a2a0c" stroke-width="2" />
  {:else if id === 'balloon'}
    {#each [[34, 40, '#e8344f'], [62, 34, '#4c7ae8'], [50, 56, '#5fe08a']] as [x, y, c] (c)}
      <path d="M{x} {Number(y) + 18} Q{Number(x) + 4} {Number(y) + 34} 50 90" fill="none" stroke="#ddd" stroke-width="1.2" />
      <ellipse cx={x} cy={y} rx="15" ry="18" fill={String(c)} stroke="rgb(0 0 0 / 0.4)" stroke-width="1.5" />
      <ellipse cx={Number(x) - 5} cy={Number(y) - 7} rx="4" ry="6" fill="#fff" opacity="0.5" />
    {/each}
  {:else if id === 'popcorn'}
    {#each [[36, 30], [50, 24], [64, 30], [42, 18], [58, 18], [30, 40], [70, 40]] as [x, y] (`${x}${y}`)}
      <circle cx={x} cy={y} r="10" fill="#fff6d8" stroke="#d9c080" stroke-width="1.5" />
    {/each}
    <path d="M24 40 H76 L68 88 H32 Z" fill="#fff" stroke="#7a0f20" stroke-width="2" />
    <path d="M34 40 L38 88 M50 40 V88 M66 40 L62 88" stroke="#e8344f" stroke-width="6" />
  {:else if id === 'ticket'}
    <path d="M10 28 H90 V42 Q82 50 90 58 V72 H10 V58 Q18 50 10 42 Z" fill="#ffd75e" stroke="#8a4a0c" stroke-width="2.5" />
    <path d="M26 28 V72" stroke="#8a4a0c" stroke-width="1.5" stroke-dasharray="3 3" />
    <circle cx="58" cy="50" r="15" fill="#e8344f" stroke="#7a0f20" stroke-width="2" />
    {#each [0, 45, 90, 135] as a (a)}
      <line x1={58 - 15 * Math.cos((a * Math.PI) / 180)} y1={50 - 15 * Math.sin((a * Math.PI) / 180)} x2={58 + 15 * Math.cos((a * Math.PI) / 180)} y2={50 + 15 * Math.sin((a * Math.PI) / 180)} stroke="#fff" stroke-width="2" />
    {/each}
    <text x="58" y="84" text-anchor="middle" class="mark" fill="#ffd75e" font-size="11" letter-spacing="1">WHEEL</text>
  {:else if id === 'koi'}
    <path d="M16 54 Q34 26 66 40 Q80 46 86 38 Q84 52 86 66 Q78 58 66 62 Q34 76 16 54 Z" fill="#ff7a3a" stroke="#7a2a0c" stroke-width="2" />
    <path d="M36 40 Q44 50 38 64 M52 38 Q58 50 52 66" fill="none" stroke="#fff" stroke-width="5" opacity="0.85" />
    <circle cx="26" cy="50" r="3" fill="#111" />
    <path d="M44 62 Q48 76 58 78" fill="none" stroke="#7a2a0c" stroke-width="2" />
  {:else if id === 'fan'}
    <path d="M50 84 L12 40 Q50 4 88 40 Z" fill="#e8344f" stroke="#7a0f20" stroke-width="2" />
    {#each [20, 32, 44, 56, 68, 80] as x (x)}<path d="M50 84 L{x} {x < 50 ? 40 - (x - 12) * 0.6 : 40 - (88 - x) * 0.6}" stroke="#7a0f20" stroke-width="1.2" />{/each}
    <path d="M24 40 Q50 18 76 40" fill="none" stroke="#ffd75e" stroke-width="3" />
    <circle cx="50" cy="84" r="4" fill="#ffd75e" />
  {:else if id === 'kite'}
    <path d="M50 10 L80 42 L50 74 L20 42 Z" fill="#4c7ae8" stroke="#1a2f7a" stroke-width="2" />
    <path d="M50 10 V74 M20 42 H80" stroke="#ffd75e" stroke-width="2" />
    <path d="M50 74 Q40 82 50 88 Q60 94 52 98" fill="none" stroke="#ddd" stroke-width="1.5" />
    <path d="M44 84 L52 80 L50 88 Z M48 92 L56 90 L52 96 Z" fill="#e8344f" />
  {:else if id === 'teapot'}
    <ellipse cx="48" cy="60" rx="28" ry="22" fill="#5fb88a" stroke="#1d5a3a" stroke-width="2" />
    <path d="M76 56 Q90 44 92 34" fill="none" stroke="#5fb88a" stroke-width="7" stroke-linecap="round" />
    <path d="M22 50 Q8 56 18 70" fill="none" stroke="#1d5a3a" stroke-width="5" />
    <ellipse cx="48" cy="40" rx="16" ry="5" fill="#4a9a72" stroke="#1d5a3a" stroke-width="2" />
    <circle cx="48" cy="33" r="4" fill="#ffd75e" />
    <path d="M30 62 Q48 70 66 62" fill="none" stroke="#ffd75e" stroke-width="2.5" />
  {:else if id === 'lantern'}
    <rect x="40" y="8" width="20" height="8" rx="2" fill="#2a1a0c" />
    <ellipse cx="50" cy="50" rx="32" ry="34" fill="#e8344f" stroke="#7a0f20" stroke-width="2" />
    <path d="M30 24 Q22 50 30 76 M42 17 Q38 50 42 83 M58 17 Q62 50 58 83 M70 24 Q78 50 70 76" fill="none" stroke="#a81a2c" stroke-width="2" />
    <ellipse cx="50" cy="50" rx="18" ry="22" fill="#ffd75e" opacity="0.45" />
    <rect x="40" y="82" width="20" height="7" rx="2" fill="#2a1a0c" />
    <path d="M50 89 V98" stroke="#ffd75e" stroke-width="2.5" />
  {:else if id === 'wild'}
    <rect x="8" y="24" width="84" height="52" rx="10" fill="#6c3fd1" stroke="#f2c64e" stroke-width="3" />
    <text x="50" y="61" text-anchor="middle" class="wild" fill="#ffe28a" font-size="27">WILD</text>
  {:else if id === 'coin' || id === 'doubloon'}
    <defs>
      <radialGradient id="coin-{uid}" cx="0.35" cy="0.3" r="0.8">
        <stop offset="0" stop-color={id === 'doubloon' ? '#fff8e0' : '#fff5c2'} />
        <stop offset="0.55" stop-color={id === 'doubloon' ? '#e8b84a' : '#f2c64e'} />
        <stop offset="1" stop-color={id === 'doubloon' ? '#8a5a12' : '#9a6a12'} />
      </radialGradient>
    </defs>
    <circle cx="50" cy="50" r="42" fill="url(#coin-{uid})" stroke="#6b4a10" stroke-width="2" />
    {#if id === 'doubloon'}
      <!-- A doubloon: a cross stamped behind the value. -->
      <path d="M50 14 V86 M14 50 H86" stroke="#a87a22" stroke-width="7" opacity="0.35" />
      <circle cx="50" cy="50" r="35" fill="none" stroke="#8a6214" stroke-width="3" />
    {:else}
      <circle cx="50" cy="50" r="34" fill="none" stroke="#8a6214" stroke-width="1.5" stroke-dasharray="3 3" />
    {/if}
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
