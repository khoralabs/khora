import type { NbcTurnBody } from "@khoralabs/obp-nbc";

import type { MultiplexChainHooks } from "./frame-mux-types";

type Waiter = {
  pred: (body: NbcTurnBody) => boolean;
  resolve: (body: NbcTurnBody) => void;
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

export function createNegotiationCoordinator(inner: NegotiationCoordinatorHooksArgs = {}): {
  hooks: MultiplexChainHooks;
  waitForTurn: (
    pred: (body: NbcTurnBody) => boolean,
    options?: WaitForTurnOptions,
  ) => Promise<NbcTurnBody>;
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

  const fulfillMatchingWaiters = (body: NbcTurnBody): void => {
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
    pred: (body: NbcTurnBody) => boolean,
    options?: WaitForTurnOptions,
  ): Promise<NbcTurnBody> =>
    new Promise<NbcTurnBody>((resolve, reject) => {
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

export function waitForPortOnOffer(
  coord: {
    waitForTurn: (
      pred: (body: NbcTurnBody) => boolean,
      options?: WaitForTurnOptions,
    ) => Promise<NbcTurnBody>;
  },
  offerId: string,
  portId: string,
  options?: WaitForTurnOptions,
): Promise<NbcTurnBody> {
  return coord.waitForTurn(
    (b) => b.offer.id === offerId && b.ports.some((p) => p.id === portId),
    options,
  );
}
