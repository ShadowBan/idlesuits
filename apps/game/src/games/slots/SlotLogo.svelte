<script lang="ts">
  /**
   * The machine's name across the top of the cabinet, lettered in its own
   * style: deco gold for the vault, molten metal for the forge, a weathered
   * plank for the pirates, a bulb-lit sign for the carnival, glowing brush
   * script for the lanterns.
   */
  interface Props {
    id: string;
    name: string;
    /** The bonus is on: the logo lights up brighter. */
    hot?: boolean;
  }

  let { id, name, hot = false }: Props = $props();
  const words = $derived(name.split(' '));
</script>

<div class="logo {id}" class:hot aria-hidden="true">
  {#if id === 'vault'}
    <span class="fan"></span>
    <small>{words[0]}</small>
    <b data-text={words.slice(1).join(' ')}>{words.slice(1).join(' ')}</b>
  {:else if id === 'forge'}
    <b data-text={name}>{name}</b>
    <span class="sparks">{#each Array.from({ length: 8 }, (_, i) => i) as i (i)}<i style:--i={i}></i>{/each}</span>
  {:else if id === 'haul'}
    <span class="plank"><b data-text={name}>{name}</b></span>
  {:else if id === 'carnival'}
    <span class="sign">
      <span class="bulbs">
        {#each Array.from({ length: 22 }, (_, i) => i) as i (i)}<i style:--i={i} style:left="{(((i % 11) + 0.5) / 11) * 100}%" style:top="{i < 11 ? 0 : 100}%"></i>{/each}
      </span>
      <b data-text={name}>{name}</b>
    </span>
  {:else if id === 'lanterns'}
    <i class="hang l"></i>
    <b data-text={name}>{name}</b>
    <i class="hang r"></i>
  {:else}
    <b>{name}</b>
  {/if}
</div>

<style>
  .logo {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    height: var(--logo-h, 44px);
    max-width: 100%;
    white-space: nowrap;
    pointer-events: none;
    user-select: none;
  }
  b {
    position: relative;
    display: block;
    line-height: 1;
  }
  /* A shine that sweeps across the lettering, through a copy clipped to the text. */
  b::after {
    content: attr(data-text);
    position: absolute;
    inset: 0;
    background: linear-gradient(105deg, transparent 40%, rgb(255 255 255 / 0.85) 50%, transparent 60%) -150% 0 / 250% 100% no-repeat;
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    -webkit-text-stroke: 0;
    text-shadow: none;
    animation: shine 4.5s ease-in-out infinite;
  }
  .hot b::after {
    animation-duration: 1.6s;
  }
  @keyframes shine {
    0%,
    55% {
      background-position: -150% 0;
    }
    100% {
      background-position: 250% 0;
    }
  }

  /* The vault: art deco gold, with a fan of rays behind it. */
  .vault {
    flex-direction: column;
    gap: 0;
  }
  .vault small {
    font: 400 clamp(8px, 1.3cqw, 11px) / 1 'Limelight', var(--font-display);
    letter-spacing: 0.6em;
    margin-right: -0.6em;
    color: #e9d9a6;
    text-transform: uppercase;
  }
  .vault b {
    font: 400 clamp(20px, 3.9cqw, 31px) / 1 'Limelight', var(--font-display);
    letter-spacing: 0.12em;
    margin-top: 2px;
    text-transform: uppercase;
    background: linear-gradient(#fff6c8, #f2c64e 45%, #a8771e 55%, #ffe69a);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    filter: drop-shadow(0 2px 0 #3d2a08) drop-shadow(0 0 12px rgb(242 198 78 / 0.45));
  }
  .vault .fan {
    position: absolute;
    left: 50%;
    top: 100%;
    width: 240px;
    height: 120px;
    translate: -50% -100%;
    border-radius: 120px 120px 0 0;
    background: repeating-conic-gradient(from -90deg at 50% 100%, rgb(242 198 78 / 0.16) 0 5deg, transparent 5deg 12deg);
    mask: radial-gradient(circle at 50% 100%, #000 30%, transparent 72%);
    animation: fan 8s ease-in-out infinite alternate;
  }
  @keyframes fan {
    to {
      opacity: 0.5;
      scale: 1.08 1;
    }
  }

  /* The forge: molten letters that flicker, with sparks flying off. */
  .forge b {
    font: 400 clamp(22px, 4.8cqw, 38px) / 1 'Metal Mania', var(--font-display);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    background: linear-gradient(#fff3b0, #ffb347 35%, #ff5a1f 70%, #8a1d06);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    filter: drop-shadow(0 0 2px #ff7a1a) drop-shadow(0 0 14px rgb(255 90 31 / 0.6));
    animation: flicker 2.2s ease-in-out infinite;
  }
  @keyframes flicker {
    0%,
    100% {
      filter: drop-shadow(0 0 2px #ff7a1a) drop-shadow(0 0 14px rgb(255 90 31 / 0.6));
    }
    40% {
      filter: drop-shadow(0 0 3px #ffb347) drop-shadow(0 0 22px rgb(255 140 40 / 0.85));
    }
    46% {
      filter: drop-shadow(0 0 1px #ff7a1a) drop-shadow(0 0 8px rgb(255 90 31 / 0.4));
    }
  }
  .sparks {
    position: absolute;
    inset: 0;
  }
  .sparks i {
    position: absolute;
    left: calc(12% + var(--i) * 11%);
    bottom: 20%;
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: #ffd36b;
    box-shadow: 0 0 6px #ff8a2a;
    opacity: 0;
    animation: spark 1.9s ease-out infinite;
    animation-delay: calc(var(--i) * -0.37s);
  }
  .hot .sparks i {
    animation-duration: 0.9s;
  }
  @keyframes spark {
    0% {
      opacity: 1;
      transform: translate(0, 0);
    }
    100% {
      opacity: 0;
      transform: translate(calc((var(--i) - 3.5) * 9px), -34px);
    }
  }

  /* The pirates: carved gold letters on a weathered plank, rocking on the swell. */
  .plank {
    display: block;
    padding: 4px 26px 6px;
    border-radius: 6px 10px 7px 12px;
    background:
      repeating-linear-gradient(90deg, rgb(0 0 0 / 0.12) 0 2px, transparent 2px 38px),
      repeating-linear-gradient(0deg, rgb(255 255 255 / 0.05) 0 1px, transparent 1px 5px),
      linear-gradient(#7a4d27, #4f2f15);
    box-shadow:
      inset 0 0 0 2px #2b1709,
      inset 0 2px 0 rgb(255 255 255 / 0.15),
      0 4px 10px rgb(0 0 0 / 0.5);
    rotate: -1.5deg;
    animation: rock 4s ease-in-out infinite alternate;
  }
  @keyframes rock {
    to {
      rotate: 1.5deg;
      translate: 0 2px;
    }
  }
  .haul b {
    font: 400 clamp(22px, 4.6cqw, 36px) / 1 'Pirata One', var(--font-display);
    letter-spacing: 0.03em;
    background: linear-gradient(#fff2b8, #e8b84a 50%, #9c6b1a);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    filter: drop-shadow(0 2px 0 #1d0f04) drop-shadow(0 0 8px rgb(76 201 176 / 0.35));
  }

  /* The carnival: a sign framed in running bulbs. */
  .sign {
    position: relative;
    display: block;
    padding: 6px 22px;
    border-radius: 10px;
    background: linear-gradient(#c81d3a, #8a0f25);
    box-shadow:
      inset 0 0 0 2px #ffd75e,
      inset 0 0 0 5px #7a0b1f,
      0 4px 14px rgb(0 0 0 / 0.5);
  }
  .carnival b {
    font: 400 clamp(18px, 3.8cqw, 30px) / 1 'Rye', var(--font-display);
    color: #fff4d6;
    text-shadow:
      0 2px 0 #5a0816,
      0 0 10px rgb(255 215 94 / 0.6);
  }
  .bulbs {
    position: absolute;
    inset: 2px;
  }
  .bulbs i {
    position: absolute;
    width: 5px;
    height: 5px;
    margin: -2.5px;
    border-radius: 50%;
    background: #fff3b0;
    box-shadow: 0 0 6px #ffd75e;
    opacity: 0.3;
    animation: run 1.1s steps(1, end) infinite;
    animation-delay: calc(var(--i) * -0.05s);
  }
  .hot .bulbs i {
    animation-duration: 0.4s;
  }
  @keyframes run {
    0% {
      opacity: 1;
    }
    25% {
      opacity: 0.3;
    }
  }

  /* The lanterns: glowing brush letters between two swinging lanterns. */
  .lanterns b {
    font: 400 clamp(22px, 4.6cqw, 36px) / 1.1 'Kaushan Script', var(--font-display);
    background: linear-gradient(#fff1c2, #ffc04a 50%, #ff7a3a);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    filter: drop-shadow(0 0 2px #ff5a1f) drop-shadow(0 0 16px rgb(255 122 58 / 0.6));
  }
  .hang {
    position: relative;
    width: 16px;
    height: 22px;
    border-radius: 45%;
    background: radial-gradient(circle at 50% 45%, #ffd27a, #e8344f 55%, #8a0f25);
    box-shadow: 0 0 14px rgb(255 122 58 / 0.8);
    transform-origin: 50% -12px;
    animation: swing 2.6s ease-in-out infinite alternate;
  }
  .hang::before {
    content: '';
    position: absolute;
    left: 50%;
    bottom: 100%;
    width: 1px;
    height: 12px;
    background: rgb(255 215 94 / 0.6);
  }
  .hang.r {
    animation-delay: -1.3s;
  }
  @keyframes swing {
    from {
      rotate: -8deg;
    }
    to {
      rotate: 8deg;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    *,
    b::after {
      animation: none !important;
    }
  }
</style>
