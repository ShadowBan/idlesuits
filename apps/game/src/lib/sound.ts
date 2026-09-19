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

export const sfx = {
  /** Card flip; pitch rises with how many of the best suit are showing. */
  flip: (count = 1) => play(0.5, 0.05, 700 + count * 90, 0, 0.01, 0.04, 4, 1.5),
  suitUp: (count: number) => play(0.35, 0, 330 * 1.12 ** count, 0.01, 0.04, 0.12, 0),
  chip: () => play(0.4, 0.05, 1500, 0, 0.01, 0.05, 1, 1, 0, 0, 500, 0.02),
  tension: () => play(0.5, 0, 70, 0.02, 0.06, 0.2, 0, 1, -2),
  win: () => play(0.6, 0, 520, 0.01, 0.08, 0.25, 1, 1, 0, 0, 260, 0.07, 0.07),
  bigWin: () => play(0.8, 0, 440, 0.02, 0.3, 0.6, 1, 1, 0, 0, 220, 0.08, 0.08, 0, 0, 0, 0.1),
  lose: () => play(0.4, 0, 220, 0.01, 0.08, 0.3, 2, 1, -6),
};
