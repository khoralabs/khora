import { EventEmitter } from "node:events";

const emitter = new EventEmitter();
emitter.setMaxListeners(100);

export function notifyJobEvent(jobId: string): void {
  emitter.emit(`job:${jobId}`);
}

export function waitForJobEvent(jobId: string, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onNotify = () => {
      cleanup();
      resolve();
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    const cleanup = () => {
      emitter.off(`job:${jobId}`, onNotify);
      signal?.removeEventListener("abort", onAbort);
    };
    emitter.on(`job:${jobId}`, onNotify);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
