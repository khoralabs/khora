import { describe, expect, test } from "bun:test";
import type { PrincipalId } from "@khoralabs/khora-contracts";
import type { KhoraHostPersistence, KhoraInvitesRepo } from "./port";

/**
 * Harness returned by each persistence strategy under test.
 * Call {@link runHostPersistenceContractTests} from each backend’s `contract.test.ts`.
 */
export type HostPersistenceContractHarness = {
  persistence: KhoraHostPersistence;
  invites: KhoraInvitesRepo;
};

export type HostPersistenceContractFactory = () =>
  | HostPersistenceContractHarness
  | Promise<HostPersistenceContractHarness>;

/**
 * Shared suite that validates a host persistence strategy against port invariants.
 * Wire every backend (in-memory, sqlite, …) through this runner so strategies stay aligned —
 * same pattern as percolator / colonnade `run*PersistenceContractTests`.
 */
export function runHostPersistenceContractTests(
  name: string,
  create: HostPersistenceContractFactory,
): void {
  describe(`validate host persistence strategy: ${name}`, () => {
    test("registerAgent + lookups round-trip", async () => {
      const { persistence: p } = await create();
      const principalId = "did:test:alice" as PrincipalId;
      const identity = p.registerAgent({
        principalId,
        username: "Alice",
        profileUpsert: { id: "profile-alice", bodyJson: '{"n":"alice"}' },
      });
      expect(identity.username).toBe("alice");
      expect(p.registrations.exists(principalId)).toBe(true);
      expect(p.registrations.profileIdForPrincipal(principalId)).toBe("profile-alice");
      expect(p.registrations.principalForProfileId("profile-alice")).toBe(principalId);
      expect(p.usernameIndex.lookupByUsername("alice")).toBe(principalId);
      expect(p.usernameIndex.lookupByPrincipal(principalId)).toBe("alice");
      expect(p.profiles.getById("profile-alice")?.bodyJson).toBe('{"n":"alice"}');
    });

    test("registerAgent rejects username taken by another principal", async () => {
      const { persistence: p } = await create();
      p.registerAgent({
        principalId: "did:test:a" as PrincipalId,
        username: "taken",
        profileUpsert: { id: "p-a", bodyJson: "{}" },
      });
      expect(() =>
        p.registerAgent({
          principalId: "did:test:b" as PrincipalId,
          username: "Taken",
          profileUpsert: { id: "p-b", bodyJson: "{}" },
        }),
      ).toThrow(/unavailable/);
    });

    test("usernameIndex rollback restores prior handle", async () => {
      const { persistence: p } = await create();
      const principalId = "did:test:roll" as PrincipalId;
      p.usernameIndex.setForPrincipal(principalId, "old");
      p.usernameIndex.setForPrincipal(principalId, "new");
      expect(p.usernameIndex.lookupByUsername("new")).toBe(principalId);
      p.usernameIndex.rollbackForPrincipal(principalId, "old");
      expect(p.usernameIndex.lookupByUsername("old")).toBe(principalId);
      expect(p.usernameIndex.lookupByUsername("new")).toBeUndefined();
    });

    test("entity upsert / get / delete", async () => {
      const { persistence: p } = await create();
      p.profiles.upsert({ id: "e1", bodyJson: '{"x":1}', memoryId: "m1" });
      const row = p.profiles.getById("e1");
      expect(row?.memoryId).toBe("m1");
      expect(row?.bodyJson).toBe('{"x":1}');
      p.profiles.deleteById("e1");
      expect(p.profiles.getById("e1")).toBeUndefined();
    });

    test("social relationship create / bind / list / delete", async () => {
      const { persistence: p } = await create();
      const creator = "did:test:creator" as PrincipalId;
      const peer = "did:test:peer" as PrincipalId;
      p.social.createRelationship({
        channelId: "ch1",
        creatorPrincipalId: creator,
        expiresAtMs: 9_000,
      });
      expect(p.social.getRelationship("ch1")?.creatorPrincipalId).toBe(creator);
      p.social.bindPeer({ channelId: "ch1", peerPrincipalId: peer });
      expect(p.social.getRelationship("ch1")?.peerPrincipalId).toBe(peer);
      expect(p.social.listRelationshipsForPrincipal(creator)).toHaveLength(1);
      expect(p.social.listRelationshipsForPrincipal(peer)).toHaveLength(1);
      p.social.refreshRelationshipTicketExpiry({ channelId: "ch1", expiresAtMs: 10_000 });
      expect(p.social.getRelationship("ch1")?.expiresAtMs).toBe(10_000);
      expect(p.social.deleteRelationship("ch1")?.channelId).toBe("ch1");
      expect(p.social.getRelationship("ch1")).toBeUndefined();
      expect(p.social.listRelationshipsForPrincipal(creator)).toHaveLength(0);
    });

    test("social pending invite indexes intended peer and clears on delete", async () => {
      const { persistence: p } = await create();
      const creator = "did:test:creator2" as PrincipalId;
      const peer = "did:test:peer2" as PrincipalId;
      p.social.createRelationship({
        channelId: "ch-pending",
        creatorPrincipalId: creator,
        intendedPeerPrincipalId: peer,
      });
      const row = p.social.getRelationship("ch-pending");
      expect(row?.peerPrincipalId).toBeNull();
      expect(
        (row?.metadata as { intendedPeerPrincipalId?: string } | undefined)
          ?.intendedPeerPrincipalId,
      ).toBe(peer);
      expect(p.social.listRelationshipsForPrincipal(creator)).toHaveLength(1);
      expect(p.social.listRelationshipsForPrincipal(peer)).toHaveLength(1);
      p.social.deleteRelationship("ch-pending");
      expect(p.social.listRelationshipsForPrincipal(creator)).toHaveLength(0);
      expect(p.social.listRelationshipsForPrincipal(peer)).toHaveLength(0);
    });

    test("agent account status set / get / clear", async () => {
      const { persistence: p } = await create();
      expect(p.agentAccountStatus.getStatus("did:x")).toBeUndefined();
      p.agentAccountStatus.setStatus("did:x", "suspended");
      expect(p.agentAccountStatus.getStatus("did:x")).toBe("suspended");
      p.agentAccountStatus.clearStatus("did:x");
      expect(p.agentAccountStatus.getStatus("did:x")).toBeUndefined();
    });

    test("phase1Unregister enqueues teardown and clears registration", async () => {
      const { persistence: p } = await create();
      const principalId = "did:test:bye" as PrincipalId;
      p.registerAgent({
        principalId,
        username: "bye",
        profileUpsert: { id: "profile-bye", bodyJson: "{}" },
      });
      p.phase1Unregister(principalId, "profile-bye", 1_000);
      expect(p.registrations.exists(principalId)).toBe(false);
      expect(p.teardownQueue.hasActiveJob(principalId)).toBe(true);
      const claimed = p.teardownQueue.tryClaimNext(2_000);
      expect(claimed).toEqual({ principalId, profileId: "profile-bye" });
      p.teardownQueue.complete(principalId);
      expect(p.teardownQueue.hasActiveJob(principalId)).toBe(false);
    });

    test("teardown failAndRequeue returns job to pending", async () => {
      const { persistence: p } = await create();
      const principalId = "did:test:retry" as PrincipalId;
      p.teardownQueue.enqueue(principalId, "prof", 1_000);
      expect(p.teardownQueue.tryClaimNext(2_000)?.principalId).toBe(principalId);
      p.teardownQueue.failAndRequeue(principalId, 3_000, "boom");
      expect(p.teardownQueue.hasActiveJob(principalId)).toBe(true);
      expect(p.teardownQueue.tryClaimNext(4_000)?.profileId).toBe("prof");
    });

    test("pendingEmbeddings enqueue / listDue / complete / fail / reset / summary", async () => {
      const { persistence: p } = await create();
      const q = p.pendingEmbeddings;
      q.enqueue({
        namespace: "ns",
        memoryKey: "m1",
        sourceKey: "body",
        text: "hello",
      });
      q.enqueue({
        namespace: "ns",
        memoryKey: "m1",
        sourceKey: "body",
        text: "updated",
      });
      const nowSec = Math.floor(Date.now() / 1000);
      const due = q.listDue({ maxAttempts: 5, nowSec, limit: 10 });
      expect(due).toHaveLength(1);
      expect(due[0]?.text).toBe("updated");
      const id = due[0]?.id;
      if (id === undefined) throw new Error("expected due id");

      q.markAttemptFailed(id, nowSec);
      expect(q.summary({ maxAttempts: 1 }).failed).toBe(1);
      expect(q.resetFailed(1)).toBe(1);
      expect(q.summary({ maxAttempts: 1 }).pending).toBe(1);
      expect(q.purgeEmpty()).toBe(0);

      q.complete(id);
      expect(q.summary().pending).toBe(0);
    });

    test("invites mint / consume / rollback / preview", async () => {
      const { invites } = await create();
      const minted = invites.mintStandardInviteTokens("did:test:minter", 2);
      expect(minted).toHaveLength(2);
      expect(invites.listInvitesMintedForDid("did:test:minter")).toHaveLength(2);

      const [token, second] = minted;
      if (token === undefined || second === undefined) {
        throw new Error("expected two minted invite tokens");
      }
      expect(invites.tryConsumeInviteToken(token, "did:test:consumer")).toBe(true);
      expect(invites.tryConsumeInviteToken(token, "did:test:other")).toBe(false);
      invites.rollbackInviteConsumption(token, "did:test:consumer");
      expect(invites.tryConsumeInviteToken(token, "did:test:consumer")).toBe(true);

      const preview = invites.previewInviteToken(second, () => ({ name: "m" }));
      expect(preview.ok).toBe(true);
      if (preview.ok) {
        expect(preview.source).toBe("inviter");
        expect(preview.inviter?.did).toBe("did:test:minter");
      }
    });

    test("invites seed / root / deleteTokensForPrincipal", async () => {
      const { invites } = await create();
      expect(invites.insertSeedInviteTokens(["seed-a", "seed-a"])).toBe(1);
      const root = invites.ensureRootInviteIfAbsent();
      expect(typeof root).toBe("string");
      expect(invites.ensureRootInviteIfAbsent()).toBeUndefined();

      const [mintedToken] = invites.mintStandardInviteTokens("did:test:gone", 1);
      if (mintedToken === undefined) {
        throw new Error("expected minted invite token");
      }
      expect(invites.tryConsumeInviteToken(mintedToken, "did:test:child")).toBe(true);
      invites.deleteTokensForPrincipal("did:test:gone");
      expect(invites.listInvitesMintedForDid("did:test:gone")).toHaveLength(0);
      expect(invites.tryConsumeInviteToken(mintedToken, "did:x")).toBe(false);
      // Lineage survives teardown of the minter.
      const descendants = invites.inviteDescendants("did:test:gone", {
        maxDepth: 3,
        maxNodes: 100,
      });
      expect(descendants).toHaveLength(1);
      expect(descendants[0]?.did).toBe("did:test:child");
    });

    test("invites parent edges, tree walk, rollback clears lineage", async () => {
      const { invites } = await create();
      const [parentTok] = invites.mintStandardInviteTokens("did:test:a", 1);
      if (parentTok === undefined) throw new Error("expected parent token");
      expect(invites.tryConsumeInviteToken(parentTok, "did:test:b")).toBe(true);

      const childToks = invites.mintStandardInviteTokens("did:test:b", 1, {
        parentPlaintext: parentTok,
      });
      const [childTok] = childToks;
      if (childTok === undefined) throw new Error("expected child token");
      expect(invites.tryConsumeInviteToken(childTok, "did:test:c")).toBe(true);

      const descendants = invites.inviteDescendants("did:test:a", {
        maxDepth: 5,
        maxNodes: 100,
      });
      expect(descendants.map((n) => n.did)).toEqual(["did:test:b", "did:test:c"]);
      expect(descendants[0]?.depth).toBe(1);
      expect(descendants[1]?.depth).toBe(2);

      const depth1 = invites.inviteDescendants("did:test:a", {
        maxDepth: 1,
        maxNodes: 100,
      });
      expect(depth1.map((n) => n.did)).toEqual(["did:test:b"]);

      const ancestors = invites.inviteAncestors("did:test:c", { maxDepth: 5 });
      expect(ancestors.map((n) => n.did)).toEqual(["did:test:b", "did:test:a"]);

      const capped = invites.inviteDescendants("did:test:a", {
        maxDepth: 5,
        maxNodes: 1,
      });
      expect(capped).toHaveLength(1);

      const [rollbackTok] = invites.mintStandardInviteTokens("did:test:b", 1, {
        parentPlaintext: parentTok,
      });
      if (rollbackTok === undefined) throw new Error("expected rollback token");
      expect(invites.tryConsumeInviteToken(rollbackTok, "did:test:rollback")).toBe(true);
      expect(
        invites
          .inviteDescendants("did:test:b", { maxDepth: 2, maxNodes: 100 })
          .some((n) => n.did === "did:test:rollback"),
      ).toBe(true);
      invites.rollbackInviteConsumption(rollbackTok, "did:test:rollback");
      expect(
        invites
          .inviteDescendants("did:test:b", { maxDepth: 2, maxNodes: 100 })
          .some((n) => n.did === "did:test:rollback"),
      ).toBe(false);

      // Mismatched consumer DID must not clear lineage for a different invitee.
      expect(invites.tryConsumeInviteToken(childTok, "did:test:c")).toBe(false);
      const [otherTok] = invites.mintStandardInviteTokens("did:test:b", 1, {
        parentPlaintext: parentTok,
      });
      if (otherTok === undefined) throw new Error("expected other token");
      expect(invites.tryConsumeInviteToken(otherTok, "did:test:keep")).toBe(true);
      invites.rollbackInviteConsumption(otherTok, "did:test:wrong");
      expect(
        invites
          .inviteDescendants("did:test:b", { maxDepth: 2, maxNodes: 100 })
          .some((n) => n.did === "did:test:keep"),
      ).toBe(true);
    });
  });
}
