import type { Port } from "../model/types";

export type ResolvePortRefResult =
  | { ok: true; canonicalId: string; path: string[] }
  | { ok: false; reason: "cycle"; path: string[] }
  | { ok: false; reason: "missing"; missingId: string; path: string[] };

/**
 * Follow `Port.ref` until a port with empty `ref` (canonical). Detects cycles and missing ids.
 * Empty `ref` on the start port means it is already canonical.
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
