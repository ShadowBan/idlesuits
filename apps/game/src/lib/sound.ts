import { zzfx, ZZFX } from 'zzfx';

// ZzFX params: volume, randomness, frequency, attack, sustain, release, shape,
// shapeCurve, slide, deltaSlide, pitchJump, pitchJumpTime, repeatTime, noise, ...
// Shapes: 0 sine, 1 triangle, 2 saw, 3 tan, 4 noise, 5 square.

let muted = false;
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
};
