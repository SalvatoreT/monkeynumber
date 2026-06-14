// One "monkey": loads the WASM search and sweeps a disjoint slice of the u32
// seed space. The main thread spawns several of these (one per CPU core), each
// with a distinct `start` and a shared `stride` (= worker count).
import init, { search } from './pkg/monkeynumber.js';

const ready = init();

// Seeds scanned per WASM call. Large enough to amortise the call overhead,
// small enough to report progress and let the winner stop its siblings quickly.
const BATCH = 1_000_000;
const U32 = 0x1_0000_0000; // 2^32

self.onmessage = async (e) => {
  const { targetArray, start, stride } = e.data;
  await ready;

  const target = new Uint8Array(targetArray);
  let seed = start >>> 0;
  let tried = 0;
  // This worker is responsible for ~2^32 / stride seeds; stop once swept.
  const sliceSize = Math.ceil(U32 / stride);

  while (tried < sliceSize) {
    const found = search(target, seed, stride, BATCH);
    if (found !== undefined) {
      self.postMessage({ type: 'completed', seed: found });
      return;
    }
    tried += BATCH;
    seed = (seed + stride * BATCH) >>> 0;
    self.postMessage({ type: 'progress', tried: BATCH });
  }

  // Swept the whole slice without a hit (only happens for very long words).
  self.postMessage({ type: 'exhausted' });
};
