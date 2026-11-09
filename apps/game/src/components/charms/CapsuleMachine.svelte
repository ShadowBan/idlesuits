<script lang="ts">
  import { findCharm } from '@idlesuits/sim';
  import { tuning } from '../../lib/tuning.svelte';
  import { meta, type Capsule } from '../../lib/meta.svelte';
  import { sfx, unlockAudio } from '../../lib/sound';
  import { RARITY_COLOR } from './art';
  import CharmArt from './CharmArt.svelte';
  import { formatTokens } from './format';

  let { onPick }: { onPick?: (id: string) => void } = $props();

  type Phase = 'idle' | 'crank' | 'reveal';
  let phase = $state<Phase>('idle');
  let capsules = $state<Capsule[]>([]);
  /** How many capsules have popped open so far, one after another. */
  let opened = $state(0);
  let turns = $state(0);
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** The capsules in the globe: fixed, so the machine looks the same every visit. */
  const ROWS = [8, 8, 7, 6, 4];
  const GLOBE = ROWS.flatMap((n, ring) =>
    Array.from({ length: n }, (_, k) => {
      const i = ROWS.slice(0, ring).reduce((a, b) => a + b, 0) + k;
      return {
        x: 100 + (k - (n - 1) / 2) * 16.5 + (ring % 2) * 5,
        y: 118 - ring * 15,
        color: ['#e0453a', '#3d7be0', '#f2c64e', '#46b35c', '#c27bff', '#f38bb5', '#5cb6ff'][(i * 3) % 7]!,
        tilt: (i * 47) % 180,
      };
    }),
  );

  async function pull(count: 1 | 10) {
    if (phase === 'crank') return;
    unlockAudio();
    const was = phase;
    // The crank turns while the machine (on the server, for a member) decides what's inside.
    phase = 'crank';
    const started = performance.now();
    const result = await meta.pull(count);
    if (!result) {
      phase = was;
      return;
    }
    capsules = result;
    opened = 0;
    turns++;
    sfx.chip();
    await wait(reduced ? 0 : Math.max(0, 750 - (performance.now() - started)));
    phase = 'reveal';
    for (let i = 0; i < result.length; i++) {
      await wait(reduced ? 0 : count === 10 ? 180 : 250);
      opened = i + 1;
      const rarity = findCharm(result[i]!.id)!.rarity;
      if (rarity === 'legendary' || rarity === 'epic') sfx.bigWin();
      else if (rarity === 'rare') sfx.win();
      else sfx.flip();
    }
  }

  function close() {
    phase = 'idle';
    capsules = [];
  }

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
</script>

<div class="machine">
  <svg viewBox="0 0 200 250" class="body" class:cranking={phase === 'crank'} aria-hidden="true">
    <defs>
      <radialGradient id="glass" cx="38%" cy="30%" r="75%">
        <stop offset="0" stop-color="#dff2ff" stop-opacity=".35" />
        <stop offset=".6" stop-color="#9cc4dd" stop-opacity=".12" />
        <stop offset="1" stop-color="#0b1a24" stop-opacity=".35" />
      </radialGradient>
    </defs>
    <!-- Globe -->
    <circle cx="100" cy="82" r="70" fill="#3a4a55" stroke="#2a1a12" stroke-width="4" />
    <circle cx="100" cy="82" r="66" fill="url(#glass)" />
    <g class="globe-capsules">
      {#each GLOBE as c, i (i)}
        <g transform="translate({c.x} {c.y}) rotate({c.tilt})">
          <circle r="8" fill={c.color} stroke="#2a1a12" stroke-width="1.8" />
          <path d="M-8 0a8 8 0 0 0 16 0z" fill="#f6f1ea" stroke="#2a1a12" stroke-width="1.8" />
        </g>
      {/each}
    </g>
    <path d="M48 50a60 60 0 0 1 38-36" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="5" stroke-linecap="round" />
    <path d="M56 64a50 50 0 0 1 6-10" fill="none" stroke="#fff" stroke-opacity=".4" stroke-width="3" stroke-linecap="round" />
    <!-- Cap -->
    <rect x="80" y="4" width="40" height="14" rx="5" fill="#c2332b" stroke="#2a1a12" stroke-width="3" />
    <!-- Base -->
    <path d="M40 140h120l14 96H26z" fill="#d23a30" stroke="#2a1a12" stroke-width="4" stroke-linejoin="round" />
    <rect x="34" y="132" width="132" height="14" rx="5" fill="#b02a22" stroke="#2a1a12" stroke-width="3" />
    <path d="M48 154h104" stroke="#fff" stroke-opacity=".25" stroke-width="3" stroke-linecap="round" />
    <!-- Coin slot plate -->
    <rect x="76" y="160" width="48" height="26" rx="5" fill="#e8b64c" stroke="#2a1a12" stroke-width="3" />
    <rect x="96" y="165" width="8" height="16" rx="2" fill="#2a1a12" />
    <!-- Crank -->
    <g class="crank" style:--turns={turns}>
      <circle cx="100" cy="205" r="14" fill="#c9ced6" stroke="#2a1a12" stroke-width="3" />
      <rect x="96" y="186" width="8" height="38" rx="4" fill="#9aa1ab" stroke="#2a1a12" stroke-width="2.5" />
      <circle cx="100" cy="205" r="4" fill="#2a1a12" />
    </g>
    <!-- Chute -->
    <path d="M130 196h22v30h-22z" fill="#5a1914" stroke="#2a1a12" stroke-width="3" />
    {#if phase === 'crank' && capsules[0]}
      <g class="dropping">
        <circle cx="141" cy="208" r="8" fill={RARITY_COLOR[findCharm(capsules[0].id)!.rarity]} stroke="#2a1a12" stroke-width="2" />
      </g>
    {/if}
    <text x="100" y="243" text-anchor="middle" font-family="Oswald,sans-serif" font-weight="700" font-size="9" letter-spacing="2" fill="#2a1a12">LUCKY CHARMS</text>
  </svg>

  <div class="buttons">
    <button type="button" class="primary" disabled={meta.tokens < tuning.values.pullCost || phase === 'crank'} onclick={() => pull(1)}>
      Pull <span class="cost">◉ {tuning.values.pullCost}</span>
    </button>
    <button type="button" disabled={meta.tokens < tuning.values.tenPullCost || phase === 'crank'} onclick={() => pull(10)}>
      Pull ×10 <span class="cost">◉ {formatTokens(tuning.values.tenPullCost)}</span>
    </button>
  </div>
  {#if meta.tokens < tuning.values.pullCost && phase === 'idle'}
    <p class="hint">Win hands at any table to earn Tokens: {formatTokens(tuning.values.pullCost - meta.tokens)} more for a pull.</p>
  {/if}
</div>

{#if phase === 'reveal'}
  <div class="reveal" role="dialog" aria-label="Your capsules">
    <div class="grid" class:single={capsules.length === 1}>
      {#each capsules as capsule, i (i)}
        {@const def = findCharm(capsule.id)!}
        <button
          type="button"
          class="prize {def.rarity}"
          class:open={i < opened}
          style:--rarity={RARITY_COLOR[def.rarity]}
          onclick={() => onPick?.(capsule.id)}
          disabled={i >= opened}
        >
          {#if i < opened}
            <span class="glow" aria-hidden="true"></span>
            <span class="art"><CharmArt id={capsule.id} /></span>
            <span class="name">{def.name}</span>
            <span class="tag">
              {#if capsule.isNew}<b class="new">New!</b>
              {:else if capsule.levelUp}<b class="up">Level {capsule.level}!</b>
              {:else}+1 copy{/if}
            </span>
          {:else}
            <span class="capsule" aria-hidden="true"></span>
          {/if}
        </button>
      {/each}
    </div>
    <button type="button" class="primary collect" disabled={opened < capsules.length} onclick={close}>Collect</button>
  </div>
{/if}

<style>
  .machine {
    display: grid;
    justify-items: center;
    gap: 12px;
  }
  .body {
    width: min(240px, 60vw);
    height: auto;
    overflow: visible;
  }
  .crank {
    transform-origin: 100px 205px;
    transform: rotate(calc(var(--turns) * 360deg));
    transition: transform 700ms cubic-bezier(0.5, 0, 0.3, 1);
  }
  .cranking .globe-capsules {
    animation: jostle 700ms ease-in-out;
    transform-origin: 100px 90px;
  }
  @keyframes jostle {
    25% {
      transform: rotate(-4deg) translateY(-2px);
    }
    50% {
      transform: rotate(3deg);
    }
    75% {
      transform: rotate(-2deg) translateY(-1px);
    }
  }
  .dropping {
    animation: drop 700ms cubic-bezier(0.5, 0, 0.7, 1.4) both;
  }
  @keyframes drop {
    from {
      transform: translateY(-14px);
      opacity: 0;
    }
  }
  .buttons {
    display: flex;
    gap: 8px;
  }
  .buttons button {
    min-height: 44px;
    padding: 10px 16px;
    font: 700 15px/1 var(--font-display);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .cost {
    margin-left: 6px;
    font: 600 12px/1 var(--font-ui);
    letter-spacing: 0;
    opacity: 0.8;
  }
  .hint {
    margin: 0;
    max-width: 34ch;
    text-align: center;
    font: 13px/1.4 var(--font-ui);
    color: var(--muted);
  }

  .reveal {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 18px;
    padding: 16px;
    background: rgb(6 4 2 / 0.86);
    backdrop-filter: blur(3px);
    animation: fade 200ms ease-out;
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 96px));
    gap: 10px;
  }
  .grid.single {
    grid-template-columns: 180px;
  }
  @media (max-width: 560px) {
    .grid {
      grid-template-columns: repeat(3, minmax(0, 96px));
    }
    .grid.single {
      grid-template-columns: 180px;
    }
  }
  .prize {
    --art: 52px;
    position: relative;
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 4px;
    aspect-ratio: 4 / 5;
    min-height: 0;
    padding: 6px;
    border-radius: 14px;
    border: 2px solid color-mix(in srgb, var(--rarity) 60%, transparent);
    background: rgb(255 255 255 / 0.04);
    overflow: hidden;
    color: var(--ink);
  }
  .single .prize {
    --art: 96px;
    gap: 8px;
  }
  .prize:disabled {
    opacity: 1;
    cursor: default;
  }
  .prize.open {
    animation: pop 380ms cubic-bezier(0.2, 0.9, 0.3, 1.4);
  }
  @keyframes pop {
    from {
      transform: scale(0.4);
    }
  }
  .glow {
    position: absolute;
    inset: -40%;
    background: radial-gradient(circle, color-mix(in srgb, var(--rarity) 45%, transparent), transparent 60%);
    pointer-events: none;
  }
  .legendary .glow,
  .epic .glow {
    background: conic-gradient(
      from 0deg,
      transparent,
      color-mix(in srgb, var(--rarity) 55%, transparent),
      transparent 30%,
      color-mix(in srgb, var(--rarity) 55%, transparent),
      transparent 60%
    );
    animation: spin 3s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(1turn);
    }
  }
  .art,
  .name,
  .tag {
    position: relative;
  }
  .name {
    font: 700 12px/1.15 var(--font-display);
    letter-spacing: 0.03em;
    text-transform: uppercase;
    text-align: center;
  }
  .single .name {
    font-size: 18px;
  }
  .tag {
    font: 500 11px/1 var(--font-ui);
    color: var(--muted);
  }
  .new {
    color: var(--gold);
  }
  .up {
    color: var(--win);
  }
  .capsule {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: linear-gradient(var(--rarity) 50%, #f6f1ea 50%);
    border: 3px solid #2a1a12;
    animation: wobble 600ms ease-in-out infinite;
  }
  @keyframes wobble {
    50% {
      transform: rotate(12deg);
    }
  }
  .collect {
    min-width: 160px;
    min-height: 44px;
    font: 700 16px/1 var(--font-display);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
</style>
