/** Configured Memories subtree roots for scoped HTTP search (`POST /v1/memories/search`). */
export type AtriumMemoriesSearchNamespaces = {
  profileNamespace: string;
  postNamespace: string;
  /** Required when searching topics or multi-scope includes topics. */
  topicNamespace?: string;
  /** Required for `probes` scope and multi includes probes. */
  probeNamespace?: string;
};

export type AtriumMemoriesEntityKind = "profiles" | "posts" | "topics" | "probes";

/**
 * Discriminated search scope: maps to whitelisted namespaces via {@link AtriumMemoriesSearchNamespaces}.
 * Use {@link kind} `"raw"` only when callers already have concrete namespace paths.
 */
export type AtriumMemoriesSearchScope =
  | { kind: "profiles"; withRelatedPosts?: boolean }
  | { kind: "posts" }
  | { kind: "topics" }
  | { kind: "probes" }
  | { kind: "multi"; includes: readonly AtriumMemoriesEntityKind[] }
  | { kind: "raw"; namespace: string; additionalNamespaces?: readonly string[] };

/** @deprecated Prefer {@link AtriumMemoriesSearchScope}. */
export type AgentRelaySearchScope = AtriumMemoriesSearchScope;

/** @deprecated Prefer {@link AtriumMemoriesSearchNamespaces}. */
export type AgentRelayMemoryNamespaces = AtriumMemoriesSearchNamespaces;

/** @deprecated Prefer {@link AtriumMemoriesEntityKind}. */
export type AgentRelayMemoryEntityKind = AtriumMemoriesEntityKind;

/** Wire/API alias for {@link AtriumMemoriesSearchScope}. */
export type MemoriesSearchScope = AtriumMemoriesSearchScope;

function namespaceForEntityKind(
  kind: AtriumMemoriesEntityKind,
  ns: AtriumMemoriesSearchNamespaces,
): string {
  switch (kind) {
    case "profiles":
      return ns.profileNamespace;
    case "posts":
      return ns.postNamespace;
    case "topics": {
      const t = ns.topicNamespace?.trim();
      if (t === undefined || t.length === 0) {
        throw new Error(
          "Atrium: topicNamespace is required on memory namespaces for topics search",
        );
      }
      return t;
    }
    case "probes": {
      const p = ns.probeNamespace?.trim();
      if (p === undefined || p.length === 0) {
        throw new Error(
          "Atrium: probeNamespace is required on memory namespaces for probes search",
        );
      }
      return p;
    }
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function dedupePathsPreserveOrder(paths: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of paths) {
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

/**
 * Resolves an {@link AtriumMemoriesSearchScope} to primary `namespace` + optional `additionalNamespaces`
 * for hybrid Memories search.
 */
export function resolveAtriumMemoriesSearchNamespaces(
  scope: AtriumMemoriesSearchScope,
  memoryNamespaces: AtriumMemoriesSearchNamespaces | undefined,
): { namespace: string; additionalNamespaces?: readonly string[] } {
  if (scope.kind === "raw") {
    return {
      namespace: scope.namespace,
      ...(scope.additionalNamespaces?.length
        ? { additionalNamespaces: scope.additionalNamespaces }
        : {}),
    };
  }

  if (memoryNamespaces === undefined) {
    throw new Error(
      "Atrium: pass namespace configuration (profile/post/topic/probe roots) for scoped search (non-raw scopes)",
    );
  }

  if (scope.kind === "profiles") {
    const additional =
      scope.withRelatedPosts === true
        ? dedupePathsPreserveOrder([memoryNamespaces.postNamespace]).filter(
            (p) => p !== memoryNamespaces.profileNamespace,
          )
        : [];
    return {
      namespace: memoryNamespaces.profileNamespace,
      ...(additional.length ? { additionalNamespaces: additional } : {}),
    };
  }

  if (scope.kind === "posts") {
    return { namespace: memoryNamespaces.postNamespace };
  }

  if (scope.kind === "topics") {
    return { namespace: namespaceForEntityKind("topics", memoryNamespaces) };
  }

  if (scope.kind === "probes") {
    return { namespace: namespaceForEntityKind("probes", memoryNamespaces) };
  }

  if (scope.kind === "multi") {
    if (scope.includes.length === 0) {
      throw new Error('Atrium: scope.kind "multi" requires a non-empty includes array');
    }
    const paths = dedupePathsPreserveOrder(
      scope.includes.map((k) => namespaceForEntityKind(k, memoryNamespaces)),
    );
    const [primary, ...rest] = paths;
    if (primary === undefined) {
      throw new Error("Atrium: multi scope produced no namespaces");
    }
    return {
      namespace: primary,
      ...(rest.length ? { additionalNamespaces: rest } : {}),
    };
  }

  const _never: never = scope;
  return _never;
}

/** @deprecated Prefer {@link resolveAtriumMemoriesSearchNamespaces}. */
export const resolveAgentRelaySearchNamespaces = resolveAtriumMemoriesSearchNamespaces;
