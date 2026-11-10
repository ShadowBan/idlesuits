import { zzfx, ZZFX } from 'zzfx';

// ZzFX params: volume, randomness, frequency, attack, sustain, release, shape,
// shapeCurve, slide, deltaSlide, pitchJump, pitchJumpTime, repeatTime, noise, ...
// Shapes: 0 sine, 1 triangle, 2 saw, 3 tan, 4 noise, 5 square.

import { load, save } from './save';

let muted = load('muted', false);
ZZFX.volume = 0.25;

function play(...params: (number | undefined)[]) {
  if (muted) return;
  try {
    zzfx(...params);
  } catch {
    // Audio is best-effort; never let it break the game loop.
  }
}

export function setMuted(value: boolean) {
  muted = value;
  save('muted', value);
}

/** The saved sound setting, for a table's mute switch to start from. */
export function isMuted(): boolean {
  return muted;
}

/** Browsers only allow audio after a user gesture; call from a click handler. */
export function unlockAudio() {
  void ZZFX.audioContext.resume();
}

/** One sound per kind of thing the player can see happen. */
export const sfx = {
  /** Any card turning over. Same sound every time. */
  flip: () => play(0.45, 0.05, 900, 0, 0.005, 0.03, 4, 1.5),
  /** Your leading suit grew (3+). Rises a step per card, so a run of them climbs. */
  playerSuit: (count: number) => play(0.35, 0, 392 * 1.26 ** (count - 3), 0.01, 0.05, 0.15, 0),
  /** The dealer's leading suit grew (3+). Low and falling: a threat. */
  dealerSuit: (count: number) => play(0.35, 0, 196 / 1.12 ** (count - 3), 0.01, 0.05, 0.2, 1, 1, -3),
  /** The next card could matter; plays as the card lifts. */
  tension: () => play(0.5, 0, 70, 0.02, 0.06, 0.2, 0, 1, -2),
  /** Chips go down on a raise, or a side bet pays you. */
  chip: () => play(0.4, 0.05, 1500, 0, 0.01, 0.05, 1, 1, 0, 0, 500, 0.02),
  win: () => play(0.5, 0, 520, 0.01, 0.06, 0.18, 1, 1, 0, 0, 260, 0.06),
  bigWin: () => play(0.8, 0, 440, 0.02, 0.3, 0.6, 1, 1, 0, 0, 220, 0.08, 0.08, 0, 0, 0, 0.1),
  lose: () => play(0.35, 0, 200, 0.01, 0.06, 0.25, 2, 1, -6),
  /** Slot reels starting to spin: a low whir. */
  spin: () => play(0.25, 0.1, 120, 0.04, 0.12, 0.12, 3, 1, 2),
  /** A slot reel stopping: a short clunk. */
  reel: () => play(0.4, 0.05, 170, 0, 0.01, 0.07, 1, 1.5),
  /** A coin landing on the reels or in hold & spin: a bright ping, a step higher for each in a row. */
  coin: (step = 0) => play(0.4, 0, 1320 * 1.06 ** Math.min(step, 14), 0, 0.02, 0.15, 0, 1, 0, 0, 660, 0.05),
  /** A bonus cell stopping on nothing: a soft tick. */
  tick: () => play(0.18, 0.05, 520, 0, 0.005, 0.03, 1, 2),
  /** The respins going back to full: a quick rising chime. */
  reset: () => play(0.35, 0, 660, 0.01, 0.08, 0.12, 0, 1, 0, 0, 330, 0.04, 0.05),
  /**
   * A new shoe being shuffled, as a dealer does it: two riffles, each a run
   * of card clicks that speeds up through the middle, the bridge as the cards
   * cascade back together, and a soft thump as the deck squares up. About 1.7
   * seconds, the length of the table's shuffle.
   */
  shuffle: () => {
    riffle(0, 520);
    bridge(560, 260);
    riffle(900, 480);
    bridge(1420, 240);
    later(1700, () => play(0.32, 0.05, 110, 0, 0.012, 0.07, 4, 0.6));
  },
};

/** Schedules a sound `ms` from now. */
function later(ms: number, fn: () => void) {
  setTimeout(fn, ms);
}

/**
 * One riffle: the cards of two halves dropping in turn, each a tiny click.
 * They come slowly at first, fast in the middle, and slow again as the last
 * cards fall, and alternate a little in tone between the two halves.
 */
function riffle(start: number, duration: number) {
  const clicks = 26;
  for (let i = 0; i < clicks; i++) {
    const t = i / (clicks - 1);
    // Eased in and out: most of the clicks fall in the middle of the riffle.
    const at = start + duration * (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
    const side = i % 2 ? 1 : 0.86;
    later(at, () => play(0.22 + 0.14 * Math.sin(Math.PI * t), 0.35, 3200 * side, 0, 0.002, 0.014, 4, 0.8));
  }
}

/** The bridge: the riffled cards arching and cascading back down, a soft run of slaps. */
function bridge(start: number, duration: number) {
  const slaps = 12;
  for (let i = 0; i < slaps; i++) {
    const t = i / (slaps - 1);
    later(start + duration * t ** 0.8, () => play(0.16 * (1 - t * 0.6), 0.4, 1900, 0, 0.003, 0.02, 4, 1));
  }
}
