import type { AgentRelayPersistenceClient } from "@khoralabs/agent-relay";
import {
  type AtriumPost,
  type AtriumProfile,
  zAtriumPost,
  zAtriumProfile,
} from "@khoralabs/atrium-contracts";
import { OutboxGhostError } from "@khoralabs/colonnade-persistence";
import type { SourceMap, Store } from "@khoralabs/memories-core";
import type { MemoriesPersistence } from "@khoralabs/memories-core/persistence";
import type { ResolvedSource } from "@khoralabs/sourcemaps";
import type { PostResolver } from "../ports.ts";

export class AtriumCanonicalStore implements Store {
  constructor(
    private readonly deps: {
      persistence: MemoriesPersistence;
      postResolver: PostResolver;
      getProfileById: (profileId: string) => AtriumProfile | undefined;
    },
  ) {}

  async resolve(ref: SourceMap): Promise<ResolvedSource> {
    const nk = this.deps.persistence.loadMemoryNamespaceKey(ref.memory_id);
    if (nk === undefined) {
      throw new Error(`AtriumCanonicalStore: unknown memory_id ${ref.memory_id}`);
    }
    const labels = this.deps.persistence.loadNodeLabelsForMemory(nk.namespace, nk.key);
    const subscriptionLabel = labels.find((l) => l.kind === "atrium_subscription");
    const postLabel = labels.find((l) => l.kind === "atrium_post");
    const contentLabel = subscriptionLabel ?? postLabel;
    if (contentLabel !== undefined) {
      const props = contentLabel.props as { postId?: string };
      const postId = props.postId;
      if (postId === undefined || postId.length === 0) {
        throw new Error("AtriumCanonicalStore: content label missing postId");
      }
      try {
        const post = await this.deps.postResolver.resolvePostById(postId);
        if (post === undefined) {
          return { kind: "json", body: JSON.stringify({ ghost: true, postId }) };
        }
        return { kind: "json", body: JSON.stringify(post satisfies AtriumPost) };
      } catch (e) {
        if (e instanceof OutboxGhostError) {
          return { kind: "json", body: JSON.stringify({ ghost: true, postId }) };
        }
        throw e;
      }
    }
    const profileLabel = labels.find((l) => l.kind === "atrium_profile");
    if (profileLabel !== undefined) {
      const props = profileLabel.props as { profileId?: string };
      const profileId = props.profileId;
      if (profileId === undefined || profileId.length === 0) {
        throw new Error("AtriumCanonicalStore: atrium_profile label missing profileId");
      }
      const profile = this.deps.getProfileById(profileId);
      if (profile === undefined) {
        throw new Error(`AtriumCanonicalStore: profile not found (${profileId})`);
      }
      zAtriumProfile.parse(profile);
      return { kind: "json", body: JSON.stringify(profile satisfies AtriumProfile) };
    }
    throw new Error(
      `AtriumCanonicalStore: no atrium content label on memory ${nk.namespace}/${nk.key}`,
    );
  }
}

export function createAtriumCanonicalStore(deps: {
  persistence: MemoriesPersistence;
  postResolver: PostResolver;
  persistenceClient: AgentRelayPersistenceClient;
}): AtriumCanonicalStore {
  return new AtriumCanonicalStore({
    persistence: deps.persistence,
    postResolver: deps.postResolver,
    getProfileById(profileId: string) {
      const row = deps.persistenceClient.getProfileById(profileId);
      if (row === undefined) return undefined;
      try {
        return zAtriumProfile.parse(JSON.parse(row.bodyJson));
      } catch {
        return undefined;
      }
    },
  });
}

export type AtriumHydratedEntity =
  | { kind: "post"; entity: AtriumPost }
  | { kind: "subscription"; entity: AtriumPost }
  | { kind: "profile"; entity: AtriumProfile }
  | { kind: "ghost"; postId: string };

export async function hydrateMemoryLabels(
  store: AtriumCanonicalStore,
  labels: ReadonlyArray<{ kind: string; props: unknown }>,
  memoryId: string,
  sourceKey = "body",
): Promise<AtriumHydratedEntity | undefined> {
  const postLabel = labels.find((l) => l.kind === "atrium_post");
  const subscriptionLabel = labels.find((l) => l.kind === "atrium_subscription");
  const profileLabel = labels.find((l) => l.kind === "atrium_profile");
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
    const entity = zAtriumPost.parse(json);
    return { kind: entity.kind === "subscription" ? "subscription" : "post", entity };
  }
  return { kind: "profile", entity: zAtriumProfile.parse(json) };
}
