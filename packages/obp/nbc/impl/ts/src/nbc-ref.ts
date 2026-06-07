/**
 * `Port.ref` resolution for NBC bind-time checks (N3) — mirrors OBP graph rules.
 */

import type { Port } from "@khoralabs/obp-model";

export type ResolvePortRefResult =
  | { ok: true; canonicalId: string; path: readonly string[] }
  | { ok: false; reason: "cycle"; path: readonly string[] }
  | {
      ok: false;
      reason: "missing";
      missingId: string;
      path: readonly string[];
    };

/**
 * Follow **`Port.ref`** until empty ref (canonical). Detects cycles and missing ids.
 */
export function resolveCanonicalPortId(
  portsById: ReadonlyMap<string, Port>,
  startPortId: string,
): ResolvePortRefResult {
  const path: string[] = [];
  const visited = new Set<string>();
  let current = startPortId;

  for (;;) {
    if (visited.has(current)) {
      return { ok: false, reason: "cycle", path };
    }
    visited.add(current);
    path.push(current);

    const port = portsById.get(current);
    if (!port) {
      return { ok: false, reason: "missing", missingId: current, path };
    }

    const next = port.ref.trim();
    if (next === "") {
      return { ok: true, canonicalId: current, path };
    }
    current = next;
  }
}
