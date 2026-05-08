import { expect, test } from "bun:test";
import {
  createNegotiationCoordinator,
  waitForPortOnOffer,
} from "./negotiation-coordinator.ts";
import type { FrameSessionHandle, TurnBody } from "./types.ts";

const fakeSession = {} as FrameSessionHandle;

test("negotiationCoordinator: waitForTurn resolves on matching inbound offer", async () => {
  const coord = createNegotiationCoordinator({});
  const later = coord.waitForTurn((b) => b.offerId === "expect-me");
  const body: TurnBody = { offerId: "expect-me", offerType: "obp.frame", ports: [] };
  await coord.hooks.onIncomingOffer?.(body, fakeSession);
  await expect(later).resolves.toEqual(body);
});

test("negotiationCoordinator: waitForPortOnOffer matches port id", async () => {
  const coord = createNegotiationCoordinator({});
  const later = waitForPortOnOffer(coord, "offer-1", "p1");
  await coord.hooks.onIncomingOffer?.(
    {
      offerId: "offer-1",
      offerType: "obp.frame",
      ports: [{ id: "p1", isTerminal: false }],
    },
    fakeSession,
  );
  const got = await later;
  expect(got.ports?.some((p) => p.id === "p1")).toBe(true);
});

test("negotiationCoordinator: timeout rejects", async () => {
  const coord = createNegotiationCoordinator({});
  const later = coord.waitForTurn(() => true, { timeoutMs: 20 });
  await expect(later).rejects.toThrow("waitForTurn timeout");
});

test("negotiationCoordinator: dispose rejects waiters", async () => {
  const coord = createNegotiationCoordinator({});
  const later = coord.waitForTurn(() => true);
  coord.dispose();
  await expect(later).rejects.toThrow("negotiation coordinator disposed");
});

test("negotiationCoordinator: inner onIncomingOffer reply preserved", async () => {
  const coord = createNegotiationCoordinator({
    async onIncomingOffer(body) {
      if (body.offerId === "ask") {
        return { offerId: "reply", offerType: "obp.frame", ports: [] };
      }
      return null;
    },
  });
  const reply = await coord.hooks.onIncomingOffer?.(
    { offerId: "ask", offerType: "obp.frame", ports: [] },
    fakeSession,
  );
  expect(reply?.offerId).toBe("reply");
});
