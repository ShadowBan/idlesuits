import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Splits rounds [0, hands) into one slice per worker, runs each slice as
 * `cli.ts --game <game> --slice start,count` in its own process, and returns
 * whatever JSON each slice printed. Games with a big spread per round need
 * tens of millions of rounds before their house edge settles down.
 */
export async function runSlices<T>(game: string, hands: number, seed: string, workers: number): Promise<T[]> {
  const per = Math.ceil(hands / workers);
  const cli = fileURLToPath(new URL('./cli.ts', import.meta.url));
  const slices = Array.from({ length: workers }, (_, w) => {
    const start = w * per;
    const count = Math.max(0, Math.min(per, hands - start));
    return new Promise<T>((resolve, reject) => {
      const child = spawn('npx', ['tsx', cli, '--game', game, '--seed', seed, '--slice', `${start},${count}`]);
      let text = '';
      child.stdout.on('data', (d) => (text += d));
      child.stderr.on('data', (d) => process.stderr.write(d));
      child.on('close', (code) => (code === 0 ? resolve(JSON.parse(text)) : reject(new Error(`slice ${w} exited ${code}`))));
    });
  });
  return Promise.all(slices);
}

/** The 95% margin of error on a mean, from a sum and sum of squares. */
export function margin95(sum: number, sq: number, n: number): { mean: number; sd: number; margin: number } {
  const mean = sum / n;
  const sd = Math.sqrt(Math.max(0, sq / n - mean * mean));
  return { mean, sd, margin: (1.96 * sd) / Math.sqrt(n) };
}
