import { defineConfig } from 'vitest/config';

/**
 * Much of the suite checks exact odds against simulation: hundreds of
 * thousands of spins, hands or drops per test. Locally each takes a second or
 * three; on a two-core CI runner, with test files running side by side, the
 * heaviest can run past Vitest's 5-second default. A minute leaves room for a
 * slow runner while still catching a test that truly hangs.
 */
export default defineConfig({
  test: {
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
