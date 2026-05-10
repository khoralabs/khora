/** Configured Memories subtree roots for scoped host search. */
export type SwarmHostMemoryNamespaces = {
  profileNamespace: string;
  postNamespace: string;
  /** Required when searching topics or multi-scope includes topics. */
  topicNamespace?: string;
};

export type SwarmHostMemoryEntityKind = "profiles" | "posts" | "topics";

/**
 * Discriminated search scope: maps to whitelisted namespaces via {@link SwarmHostMemoryNamespaces}.
 * Use {@link kind} `"raw"` only when callers already have concrete namespace paths.
 */
export type SwarmHostSearchScope =
  | { kind: "profiles"; withRelatedPosts?: boolean }
  | { kind: "posts" }
  | { kind: "topics" }
  | { kind: "multi"; includes: readonly SwarmHostMemoryEntityKind[] }
  | { kind: "raw"; namespace: string; additionalNamespaces?: readonly string[] };

function namespaceForEntityKind(
  kind: SwarmHostMemoryEntityKind,
  ns: SwarmHostMemoryNamespaces,
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
          "SwarmHost: topicNamespace is required on memoryNamespaces for topics search",
        );
      }
      return t;
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
 * Resolves a {@link SwarmHostSearchScope} to primary {@code namespace} + optional {@code additionalNamespaces}.
 */
export function resolveSwarmHostSearchNamespaces(
  scope: SwarmHostSearchScope,
  memoryNamespaces: SwarmHostMemoryNamespaces | undefined,
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
      "SwarmHost: pass memoryNamespaces on SwarmHostDeps to use scoped search (non-raw scopes)",
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

  if (scope.kind === "multi") {
    if (scope.includes.length === 0) {
      throw new Error('SwarmHost: scope.kind "multi" requires a non-empty includes array');
    }
    const paths = dedupePathsPreserveOrder(
      scope.includes.map((k) => namespaceForEntityKind(k, memoryNamespaces)),
    );
    const [primary, ...rest] = paths;
    if (primary === undefined) {
      throw new Error("SwarmHost: multi scope produced no namespaces");
    }
    return {
      namespace: primary,
      ...(rest.length ? { additionalNamespaces: rest } : {}),
    };
  }

  const _never: never = scope;
  return _never;
}
