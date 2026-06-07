import { OutboxGhostError } from "@khoralabs/colonnade-persistence";
import type { AgentRelayPersistenceClient } from "@khoralabs/host-runtime";
import {
  type KhoraPost,
  type KhoraProfile,
  zKhoraPost,
  zKhoraProfile,
} from "@khoralabs/khora-contracts";
import type { SourceMap, Store } from "@khoralabs/memories-core";
import type { MemoriesPersistence } from "@khoralabs/memories-core/persistence";
import type { ResolvedSource } from "@khoralabs/sourcemaps";
import type { PostResolver } from "../ports";

export class KhoraCanonicalStore implements Store {
  constructor(
    private readonly deps: {
      persistence: MemoriesPersistence;
      postResolver: PostResolver;
      getProfileById: (profileId: string) => KhoraProfile | undefined;
    },
  ) {}

  async resolve(ref: SourceMap): Promise<ResolvedSource> {
    const nk = this.deps.persistence.loadMemoryNamespaceKey(ref.memory_id);
    if (nk === undefined) {
      throw new Error(`KhoraCanonicalStore: unknown memory_id ${ref.memory_id}`);
    }
    const labels = this.deps.persistence.loadNodeLabelsForMemory(nk.namespace, nk.key);
    const subscriptionLabel = labels.find((l) => l.kind === "khora_subscription");
    const postLabel = labels.find((l) => l.kind === "khora_post");
    const contentLabel = subscriptionLabel ?? postLabel;
    if (contentLabel !== undefined) {
      const props = contentLabel.props as { postId?: string };
      const postId = props.postId;
      if (postId === undefined || postId.length === 0) {
        throw new Error("KhoraCanonicalStore: content label missing postId");
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
        throw new Error("KhoraCanonicalStore: khora_profile label missing profileId");
      }
      const profile = this.deps.getProfileById(profileId);
      if (profile === undefined) {
        throw new Error(`KhoraCanonicalStore: profile not found (${profileId})`);
      }
      zKhoraProfile.parse(profile);
      return { kind: "json", body: JSON.stringify(profile satisfies KhoraProfile) };
    }
    throw new Error(
      `KhoraCanonicalStore: no khora content label on memory ${nk.namespace}/${nk.key}`,
    );
  }
}

export function createKhoraCanonicalStore(deps: {
  persistence: MemoriesPersistence;
  postResolver: PostResolver;
  persistenceClient: AgentRelayPersistenceClient;
}): KhoraCanonicalStore {
  return new KhoraCanonicalStore({
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
  | { kind: "ghost"; postId: string };

export async function hydrateMemoryLabels(
  store: KhoraCanonicalStore,
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
  const resolved = await store.resolve({ memory_id: memoryId, source_key: sourceKey });
  if (resolved.kind !== "json") return undefined;
  const bodyText = typeof resolved.body === "string" ? resolved.body : await resolved.body.text();
  let json: unknown;
  try {
    json = JSON.parse(bodyText);
  } catch {
    return undefined;
  }
  if (json !== null && typeof json === "object" && "ghost" in json && json.ghost === true) {
    const postId =
      typeof (json as { postId?: unknown }).postId === "string"
        ? ((json as { postId?: string }).postId ?? "")
        : "";
    return { kind: "ghost", postId };
  }
  if (postLabel !== undefined || subscriptionLabel !== undefined) {
    const entity = zKhoraPost.parse(json);
    return { kind: entity.kind === "subscription" ? "subscription" : "post", entity };
  }
  return { kind: "profile", entity: zKhoraProfile.parse(json) };
}
