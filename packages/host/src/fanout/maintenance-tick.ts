export function createFanOutMaintenanceTick(opts: {
  reconcileEveryMs: number;
  gcEveryMs: number;
  reconcile: () => Promise<void>;
  gc?: () => Promise<void>;
  now?: () => number;
}): () => Promise<void> {
  let lastReconcile = Number.NEGATIVE_INFINITY;
  let lastGc = Number.NEGATIVE_INFINITY;
  return async () => {
    const now = opts.now?.() ?? Date.now();
    if (now - lastReconcile >= opts.reconcileEveryMs) {
      lastReconcile = now;
      await opts.reconcile();
    }
    if (opts.gc !== undefined && now - lastGc >= opts.gcEveryMs) {
      lastGc = now;
      await opts.gc();
    }
  };
}
