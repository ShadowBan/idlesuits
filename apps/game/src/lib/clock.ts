/** A wait() that pauses while `paused` is set and can be cancelled by `reset()`. */
export class Clock {
  paused = false;
  private generation = 0;

  /** Resolves true when the time has elapsed, false if the clock was reset meanwhile. */
  async wait(ms: number): Promise<boolean> {
    const gen = this.generation;
    let remaining = ms;
    let last = performance.now();
    while (remaining > 0 || this.paused) {
      await new Promise((r) => setTimeout(r, Math.min(Math.max(remaining, 0), 50) || 50));
      if (gen !== this.generation) return false;
      const now = performance.now();
      if (!this.paused) remaining -= now - last;
      last = now;
    }
    return gen === this.generation;
  }

  reset(): void {
    this.generation++;
    this.paused = false;
  }
}
