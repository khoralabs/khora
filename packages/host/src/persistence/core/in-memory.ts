import { normalizeUsername, type PrincipalId } from "@khoralabs/khora-contracts";
import type {
  AgentAccountStatus,
  ClaimedTeardownJob,
  HostEntityRow,
  HostEntityUpsert,
  KhoraHostPersistence,
  SocialAgentIdentity,
  SocialRegisterAgentInput,
  SocialRelationshipRow,
} from "./port";

type TeardownJob = {
  principalId: PrincipalId;
  profileId: string;
  state: "pending" | "running";
  enqueuedAtMs: number;
  lastError?: string;
};

export function createInMemoryKhoraHostPersistence(): KhoraHostPersistence {
  const profiles = new Map<string, HostEntityRow>();
  const byPrincipal = new Map<PrincipalId, string>();
  const byProfile = new Map<string, PrincipalId>();
  const usernameToPrincipal = new Map<string, PrincipalId>();
  const principalToUsername = new Map<PrincipalId, string>();
  const relationships = new Map<string, SocialRelationshipRow>();
  const channelsByPrincipal = new Map<PrincipalId, Set<string>>();
  const accountStatus = new Map<string, AgentAccountStatus>();
  const teardownJobs = new Map<PrincipalId, TeardownJob>();

  function addChannelIndex(principalId: PrincipalId, channelId: string): void {
    let set = channelsByPrincipal.get(principalId);
    if (set === undefined) {
      set = new Set();
      channelsByPrincipal.set(principalId, set);
    }
    set.add(channelId);
  }

  function removeChannelIndex(principalId: PrincipalId, channelId: string): void {
    channelsByPrincipal.get(principalId)?.delete(channelId);
  }

  const persistence: KhoraHostPersistence = {
    profiles: {
      upsert(record: HostEntityUpsert): void {
        profiles.set(record.id, {
          id: record.id,
          memoryId: record.memoryId ?? null,
          bodyJson: record.bodyJson,
          updatedAtMs: Date.now(),
        });
      },
      getById(id: string): HostEntityRow | undefined {
        const row = profiles.get(id);
        return row === undefined ? undefined : { ...row };
      },
      deleteById(id: string): void {
        profiles.delete(id);
      },
    },

    registrations: {
      exists(principalId: PrincipalId): boolean {
        return byPrincipal.has(principalId);
      },
      upsert(principalId: PrincipalId, profileId: string): void {
        byPrincipal.set(principalId, profileId);
        byProfile.set(profileId, principalId);
      },
      delete(principalId: PrincipalId, profileId: string): void {
        byPrincipal.delete(principalId);
        byProfile.delete(profileId);
      },
      profileIdForPrincipal(principalId: PrincipalId): string | undefined {
        return byPrincipal.get(principalId);
      },
      principalForProfileId(profileId: string): PrincipalId | undefined {
        return byProfile.get(profileId);
      },
    },

    social: {
      createRelationship(params): void {
        const now = Date.now();
        const row: SocialRelationshipRow = {
          channelId: params.channelId,
          creatorPrincipalId: params.creatorPrincipalId,
          peerPrincipalId: null,
          createdAtMs: now,
          ...(params.expiresAtMs !== undefined ? { expiresAtMs: params.expiresAtMs } : {}),
          ...(params.metadata !== undefined ? { metadata: params.metadata } : {}),
        };
        relationships.set(params.channelId, row);
        addChannelIndex(params.creatorPrincipalId, params.channelId);
      },

      getRelationship(channelId: string): SocialRelationshipRow | undefined {
        const row = relationships.get(channelId);
        return row === undefined ? undefined : { ...row };
      },

      bindPeer(params): void {
        const current = relationships.get(params.channelId);
        if (current === undefined) {
          throw new Error(`SocialRelationship: unknown channel ${params.channelId}`);
        }
        if (current.peerPrincipalId !== null) {
          if (current.peerPrincipalId === params.peerPrincipalId) return;
          throw new Error(
            `SocialRelationship: channel ${params.channelId} already bound to another peer`,
          );
        }
        if (params.peerPrincipalId === current.creatorPrincipalId) {
          throw new Error("SocialRelationship: peer cannot be the creator");
        }
        relationships.set(params.channelId, {
          ...current,
          peerPrincipalId: params.peerPrincipalId,
        });
        addChannelIndex(params.peerPrincipalId, params.channelId);
      },

      refreshRelationshipTicketExpiry(params): void {
        const current = relationships.get(params.channelId);
        if (current === undefined) return;
        relationships.set(params.channelId, {
          ...current,
          expiresAtMs: params.expiresAtMs,
        });
      },

      listRelationshipsForPrincipal(principalId: PrincipalId): SocialRelationshipRow[] {
        const ids = channelsByPrincipal.get(principalId);
        if (ids === undefined) return [];
        const out: SocialRelationshipRow[] = [];
        for (const channelId of [...ids].reverse()) {
          const row = relationships.get(channelId);
          if (row !== undefined) out.push({ ...row });
        }
        return out;
      },

      deleteRelationship(channelId: string): SocialRelationshipRow | undefined {
        const r = relationships.get(channelId);
        if (r === undefined) return undefined;
        relationships.delete(channelId);
        removeChannelIndex(r.creatorPrincipalId, channelId);
        if (r.peerPrincipalId !== null) {
          removeChannelIndex(r.peerPrincipalId, channelId);
        }
        return { ...r };
      },
    },

    agentAccountStatus: {
      getStatus(did: string): AgentAccountStatus | undefined {
        return accountStatus.get(did);
      },
      setStatus(did: string, status: AgentAccountStatus): void {
        accountStatus.set(did, status);
      },
      clearStatus(did: string): void {
        accountStatus.delete(did);
      },
    },

    usernameIndex: {
      lookupByUsername(normalizedUsername: string): PrincipalId | undefined {
        return usernameToPrincipal.get(normalizedUsername);
      },
      lookupByPrincipal(principalId: PrincipalId): string | undefined {
        return principalToUsername.get(principalId);
      },
      setForPrincipal(principalId: PrincipalId, normalizedUsername: string): void {
        const prior = principalToUsername.get(principalId);
        if (prior !== undefined && prior !== normalizedUsername) {
          usernameToPrincipal.delete(prior);
        }
        usernameToPrincipal.set(normalizedUsername, principalId);
        principalToUsername.set(principalId, normalizedUsername);
      },
      deleteForPrincipal(principalId: PrincipalId): void {
        const username = principalToUsername.get(principalId);
        principalToUsername.delete(principalId);
        if (username !== undefined) {
          usernameToPrincipal.delete(username);
        }
      },
      rollbackForPrincipal(
        principalId: PrincipalId,
        priorNormalizedUsername: string | undefined,
      ): void {
        const current = principalToUsername.get(principalId);
        if (current !== undefined) {
          usernameToPrincipal.delete(current);
        }
        if (priorNormalizedUsername !== undefined) {
          usernameToPrincipal.set(priorNormalizedUsername, principalId);
          principalToUsername.set(principalId, priorNormalizedUsername);
        } else {
          principalToUsername.delete(principalId);
        }
      },
    },

    teardownQueue: {
      enqueue(principalId: PrincipalId, profileId: string, nowMs: number): void {
        teardownJobs.set(principalId, {
          principalId,
          profileId,
          state: "pending",
          enqueuedAtMs: nowMs,
        });
      },
      tryClaimNext(nowMs: number): ClaimedTeardownJob | undefined {
        void nowMs;
        let best: TeardownJob | undefined;
        for (const job of teardownJobs.values()) {
          if (job.state !== "pending") continue;
          if (best === undefined || job.enqueuedAtMs < best.enqueuedAtMs) {
            best = job;
          }
        }
        if (best === undefined) return undefined;
        best.state = "running";
        return { principalId: best.principalId, profileId: best.profileId };
      },
      hasActiveJob(principalId: PrincipalId): boolean {
        const job = teardownJobs.get(principalId);
        return job !== undefined && (job.state === "pending" || job.state === "running");
      },
      complete(principalId: PrincipalId): void {
        teardownJobs.delete(principalId);
      },
      failAndRequeue(principalId: PrincipalId, nowMs: number, error: string): void {
        const job = teardownJobs.get(principalId);
        if (job === undefined) return;
        job.state = "pending";
        job.enqueuedAtMs = nowMs;
        job.lastError = error;
      },
    },

    registerAgent(input: SocialRegisterAgentInput): SocialAgentIdentity {
      const username = normalizeUsername(input.username);
      const profileId = input.profileUpsert.id;
      const existingPrincipal = persistence.usernameIndex.lookupByUsername(username);
      if (existingPrincipal !== undefined && existingPrincipal !== input.principalId) {
        throw new Error(`username '${username}' is unavailable`);
      }
      persistence.profiles.upsert(input.profileUpsert);
      persistence.registrations.upsert(input.principalId, profileId);
      persistence.usernameIndex.setForPrincipal(input.principalId, username);
      return { principalId: input.principalId, profileId, username };
    },

    phase1Unregister(principalId: PrincipalId, profileId: string, nowMs: number): void {
      persistence.registrations.delete(principalId, profileId);
      persistence.teardownQueue.enqueue(principalId, profileId, nowMs);
    },
  };

  return persistence;
}
