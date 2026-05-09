import type { MultiplexChainHooks, TurnBody } from "./types.ts";

type Waiter = {
  pred: (body: TurnBody) => boolean;
  resolve: (body: TurnBody) => void;
  reject: (err: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
  onAbort?: () => void;
};

export type NegotiationCoordinatorHooksArgs = Pick<
  MultiplexChainHooks,
  "onIncomingOffer" | "onTerminate"
>;

export type WaitForTurnOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
};

/**
 * Wraps per-chain {@link MultiplexChainHooks} so callers can **`await`** matching inbound {@link TurnBody}s
 * ({@link waitForTurn}) while still returning replies from **`onIncomingOffer`**. Matches only turns delivered **after**
 * {@link waitForTurn} is called unless you overlap delivery with an async gap (see README).
 *
 * Waiters are rejected with **`Error("chain terminated")`** on inbound peer {@link MultiplexChainHooks.onTerminate}
 * or {@link dispose}.
 */
export function createNegotiationCoordinator(inner: NegotiationCoordinatorHooksArgs = {}): {
  hooks: MultiplexChainHooks;
  waitForTurn: (
    pred: (body: TurnBody) => boolean,
    options?: WaitForTurnOptions,
  ) => Promise<TurnBody>;
  dispose: () => void;
} {
  const waiters: Waiter[] = [];

  const rejectAll = (err: Error): void => {
    for (const w of waiters) {
      if (w.timer !== undefined) clearTimeout(w.timer);
      if (w.onAbort !== undefined) w.onAbort();
      w.reject(err);
    }
    waiters.length = 0;
  };

  const fulfillMatchingWaiters = (body: TurnBody): void => {
    for (let i = waiters.length - 1; i >= 0; i--) {
      const w = waiters[i];
      if (w === undefined) continue;
      if (w.pred(body)) {
        if (w.timer !== undefined) clearTimeout(w.timer);
        if (w.onAbort !== undefined) w.onAbort();
        waiters.splice(i, 1);
        w.resolve(body);
      }
    }
  };

  const waitForTurn = (
    pred: (body: TurnBody) => boolean,
    options?: WaitForTurnOptions,
  ): Promise<TurnBody> =>
    new Promise<TurnBody>((resolve, reject) => {
      if (options?.signal?.aborted === true) {
        reject(new Error("waitForTurn aborted"));
        return;
      }

      const w: Waiter = { pred, resolve, reject };

      const onAbort = (): void => {
        const idx = waiters.indexOf(w);
        if (idx >= 0) waiters.splice(idx, 1);
        if (w.timer !== undefined) clearTimeout(w.timer);
        reject(new Error("waitForTurn aborted"));
      };

      if (options?.signal !== undefined) {
        options.signal.addEventListener("abort", onAbort, { once: true });
        w.onAbort = () => options.signal?.removeEventListener("abort", onAbort);
      }

      if (options?.timeoutMs !== undefined && options.timeoutMs >= 0) {
        w.timer = setTimeout(() => {
          const idx = waiters.indexOf(w);
          if (idx >= 0) waiters.splice(idx, 1);
          if (w.onAbort !== undefined) w.onAbort();
          reject(new Error("waitForTurn timeout"));
        }, options.timeoutMs);
      }

      waiters.push(w);
    });

  const hooks: MultiplexChainHooks = {
    async onIncomingOffer(body, session) {
      fulfillMatchingWaiters(body);
      return (await inner.onIncomingOffer?.(body, session)) ?? null;
    },
    async onTerminate(reason, code, session) {
      rejectAll(new Error("chain terminated"));
      await inner.onTerminate?.(reason, code, session);
    },
  };

  return {
    hooks,
    waitForTurn,
    dispose: () => rejectAll(new Error("negotiation coordinator disposed")),
  };
}

/** Convenience {@link createNegotiationCoordinator} **`waitForTurn`**: match **`offerId`** and a **`ports`** entry. */
export function waitForPortOnOffer(
  coord: {
    waitForTurn: (
      pred: (body: TurnBody) => boolean,
      options?: WaitForTurnOptions,
    ) => Promise<TurnBody>;
  },
  offerId: string,
  portId: string,
  options?: WaitForTurnOptions,
): Promise<TurnBody> {
  return coord.waitForTurn(
    (b) => b.offerId === offerId && (b.ports?.some((p) => p.id === portId) ?? false),
    options,
  );
}
