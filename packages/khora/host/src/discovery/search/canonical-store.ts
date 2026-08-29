import { OutboxGhostError } from "@khoralabs/colonnade";
import {
  type KhoraPost,
  type KhoraProfile,
  zKhoraPost,
  zKhoraProfile,
} from "@khoralabs/khora-contracts";
import type {
  MemoriesClientAsync,
  MemoriesPersistenceAsync,
  SourceMap,
} from "@khoralabs/memories-node";
import type { ResolvedSource, Store } from "@khoralabs/sourcemaps";
import type { HostPersistenceClient } from "../../persistence/core/client";
import type { PostResolver } from "../../ports";
import type { khoraOntology } from "./ontology";

export class HostSearchCanonicalStore implements Store {
  constructor(
    private readonly deps: {
      persistence: MemoriesPersistenceAsync;
      postResolver: PostResolver;
      getProfileById: (profileId: string) => KhoraProfile | undefined;
    },
  ) {}

  async resolve(ref: SourceMap): Promise<ResolvedSource> {
    const nk = await this.deps.persistence.loadMemoryNamespaceKey(ref.memory_id);
    if (nk === undefined) {
      throw new Error(`HostSearchCanonicalStore: unknown memory_id ${ref.memory_id}`);
    }
    const labels = await this.deps.persistence.loadNodeLabelsForMemory(nk.namespace, nk.key);
    const subscriptionLabel = labels.find((l) => l.kind === "khora_subscription");
    const postLabel = labels.find((l) => l.kind === "khora_post");
    const contentLabel = subscriptionLabel ?? postLabel;
    if (contentLabel !== undefined) {
      const props = contentLabel.props as { postId?: string };
      const postId = props.postId;
      if (postId === undefined || postId.length === 0) {
        throw new Error("HostSearchCanonicalStore: content label missing postId");
      }
      try {
        const post = await this.deps.postResolver.resolvePostById(postId);
        if (post === undefined) {
          return { kind: "json", body: JSON.stringify({ ghost: true, postId }) };
        }
        return { kind: "json", body: JSON.stringify(post satisfies KhoraPost) };
      } catch (e) {
        if (e instanceof OutboxGhostError) {
          return { kind: "json", body: JSON.stringify({ ghost: true, postId }) };
        }
        throw e;
      }
    }
    const profileLabel = labels.find((l) => l.kind === "khora_profile");
    if (profileLabel !== undefined) {
      const props = profileLabel.props as { profileId?: string };
      const profileId = props.profileId;
      if (profileId === undefined || profileId.length === 0) {
        throw new Error("HostSearchCanonicalStore: khora_profile label missing profileId");
      }
      const profile = this.deps.getProfileById(profileId);
      if (profile === undefined) {
        return { kind: "json", body: JSON.stringify({ ghost: true, profileId }) };
      }
      zKhoraProfile.parse(profile);
      return { kind: "json", body: JSON.stringify(profile satisfies KhoraProfile) };
    }
    throw new Error(
      `HostSearchCanonicalStore: no khora content label on memory ${nk.namespace}/${nk.key}`,
    );
  }
}

export function createHostSearchCanonicalStore(deps: {
  persistence: MemoriesPersistenceAsync;
  postResolver: PostResolver;
  persistenceClient: HostPersistenceClient;
}): HostSearchCanonicalStore {
  return new HostSearchCanonicalStore({
    persistence: deps.persistence,
    postResolver: deps.postResolver,
    getProfileById(profileId: string) {
      const row = deps.persistenceClient.getProfileById(profileId);
      if (row === undefined) return undefined;
      try {
        return zKhoraProfile.parse(JSON.parse(row.bodyJson));
      } catch {
        return undefined;
      }
    },
  });
}

export type KhoraHydratedEntity =
  | { kind: "post"; entity: KhoraPost }
  | { kind: "subscription"; entity: KhoraPost }
  | { kind: "profile"; entity: KhoraProfile }
  | { kind: "ghost"; postId?: string; profileId?: string }
  | { kind: "orphan" };

export async function purgeOrphanMemory(
  client: MemoriesClientAsync<typeof khoraOntology.nodeLabels, typeof khoraOntology.edgeLabels>,
  persistence: MemoriesPersistenceAsync,
  memoryId: string,
): Promise<void> {
  try {
    const nk = await persistence.loadMemoryNamespaceKey(memoryId);
    if (nk === undefined) {
      return;
    }
    await client.deleteMemory({ namespace: nk.namespace, key: nk.key });
  } catch {
    // best-effort purge of stale index rows
  }
}

export async function hydrateMemoryLabels(
  store: HostSearchCanonicalStore,
  labels: ReadonlyArray<{ kind: string; props: unknown }>,
  memoryId: string,
  sourceKey = "body",
): Promise<KhoraHydratedEntity | undefined> {
  const postLabel = labels.find((l) => l.kind === "khora_post");
  const subscriptionLabel = labels.find((l) => l.kind === "khora_subscription");
  const profileLabel = labels.find((l) => l.kind === "khora_profile");
  if (postLabel === undefined && subscriptionLabel === undefined && profileLabel === undefined) {
    return undefined;
  }
  let resolved: ResolvedSource;
  try {
    resolved = await store.resolve({ memory_id: memoryId, source_key: sourceKey });
  } catch {
    return { kind: "orphan" };
  }
  if (resolved.kind !== "json") return undefined;
  const bodyText = typeof resolved.body === "string" ? resolved.body : await resolved.body.text();
  let json: unknown;
  try {
    json = JSON.parse(bodyText);
  } catch {
    return { kind: "orphan" };
  }
  if (json !== null && typeof json === "object" && "ghost" in json && json.ghost === true) {
    const row = json as { postId?: unknown; profileId?: unknown };
    const postId = typeof row.postId === "string" && row.postId.length > 0 ? row.postId : undefined;
    const profileId =
      typeof row.profileId === "string" && row.profileId.length > 0 ? row.profileId : undefined;
    return {
      kind: "ghost",
      ...(postId !== undefined ? { postId } : {}),
      ...(profileId !== undefined ? { profileId } : {}),
    };
  }
  if (postLabel !== undefined || subscriptionLabel !== undefined) {
    const entity = zKhoraPost.parse(json);
    return { kind: entity.kind === "subscription" ? "subscription" : "post", entity };
  }
  return { kind: "profile", entity: zKhoraProfile.parse(json) };
}
