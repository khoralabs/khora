import type { PrincipalLifecycle } from "./lifecycle";

export type PrincipalTeardownWorkerHandle = { stop(): void };

export function startPrincipalTeardownWorker(opts: {
  lifecycle: PrincipalLifecycle;
  intervalMs?: number;
}): PrincipalTeardownWorkerHandle {
  const intervalMs = opts.intervalMs ?? 500;
  let stopped = false;
  const tick = (): void => {
    if (stopped) return;
    void opts.lifecycle.runNextTeardownJob().catch(() => {
      /* lifecycle re-queues failed jobs */
    });
  };
  const id = setInterval(tick, intervalMs);
  return {
    stop(): void {
      stopped = true;
      clearInterval(id);
    },
  };
}
