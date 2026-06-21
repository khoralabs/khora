export type ActiveTurn = {
  turnId: string;
  abortController: AbortController;
  task: Promise<void>;
};

export type InFlightRegistry = {
  get(threadId: string): ActiveTurn | undefined;
  reserveTurn(threadId: string, turnId: string): AbortController | null;
  attachTask(threadId: string, turnId: string, task: Promise<void>): void;
  abort(threadId: string, turnId: string): void;
  release(threadId: string): void;
};

export function createInFlightRegistry(): InFlightRegistry {
  const activeByThread = new Map<string, ActiveTurn>();

  return {
    get(threadId) {
      return activeByThread.get(threadId);
    },

    reserveTurn(threadId, turnId) {
      if (activeByThread.has(threadId)) return null;
      const abortController = new AbortController();
      activeByThread.set(threadId, {
        turnId,
        abortController,
        task: Promise.resolve(),
      });
      return abortController;
    },

    attachTask(threadId, turnId, task) {
      const active = activeByThread.get(threadId);
      if (active === undefined || active.turnId !== turnId) return;
      active.task = task;
      void task.finally(() => {
        const current = activeByThread.get(threadId);
        if (current?.turnId === turnId) {
          activeByThread.delete(threadId);
        }
      });
    },

    abort(threadId, turnId) {
      const active = activeByThread.get(threadId);
      if (active === undefined || active.turnId !== turnId) return;
      active.abortController.abort();
    },

    release(threadId) {
      const active = activeByThread.get(threadId);
      if (active === undefined) return;
      active.abortController.abort();
      activeByThread.delete(threadId);
    },
  };
}
