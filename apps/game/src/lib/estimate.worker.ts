import { runBatch, type BatchInput } from '@idlesuits/balance';

// Runs estimate simulations off the main thread so animations never stutter.
const worker = self as unknown as Worker;

worker.addEventListener('message', (e: MessageEvent<{ id: number; input: BatchInput }>) => {
  worker.postMessage({ id: e.data.id, stats: runBatch(e.data.input) });
});
