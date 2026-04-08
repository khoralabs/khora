import type { IdentityLink } from "./identity-link.js";

export type ToolRefRow = { toolKey: string; toolHash: string };

/** Symmetric diff of two runtime tool ref lists (order-independent, keyed by `toolKey`). */
export type ToolRefsDiff = {
  onlyInFirst: ToolRefRow[];
  onlyInSecond: ToolRefRow[];
  hashChanged: Array<{
    toolKey: string;
    firstHash: string;
    secondHash: string;
  }>;
};

export function diffToolRefs(
  first: ToolRefRow[],
  second: ToolRefRow[],
): ToolRefsDiff {
  const m1 = new Map(first.map((r) => [r.toolKey, r.toolHash] as const));
  const m2 = new Map(second.map((r) => [r.toolKey, r.toolHash] as const));
  const onlyInFirst: ToolRefRow[] = [];
  const onlyInSecond: ToolRefRow[] = [];
  const hashChanged: ToolRefsDiff["hashChanged"] = [];

  for (const [k, h1] of m1) {
    const h2 = m2.get(k);
    if (h2 === undefined) {
      onlyInFirst.push({ toolKey: k, toolHash: h1 });
    } else if (h1 !== h2) {
      hashChanged.push({ toolKey: k, firstHash: h1, secondHash: h2 });
    }
  }
  for (const [k, h2] of m2) {
    if (!m1.has(k)) {
      onlyInSecond.push({ toolKey: k, toolHash: h2 });
    }
  }
  return { onlyInFirst, onlyInSecond, hashChanged };
}

export type IdentityLinkField = keyof IdentityLink;

export type IdentityLinkFieldChange = {
  field: IdentityLinkField;
  first: string;
  second: string;
};

/** Which {@link IdentityLink} fields match vs differ. */
export type IdentityLinksDiff = {
  unchanged: IdentityLinkField[];
  changed: IdentityLinkFieldChange[];
};

const IDENTITY_LINK_FIELDS: IdentityLinkField[] = [
  "agentId",
  "agentName",
  "staticHash",
  "runtimeHash",
];

export function diffIdentityLinks(
  a: IdentityLink,
  b: IdentityLink,
): IdentityLinksDiff {
  const unchanged: IdentityLinkField[] = [];
  const changed: IdentityLinkFieldChange[] = [];
  for (const field of IDENTITY_LINK_FIELDS) {
    const first = a[field];
    const second = b[field];
    if (first === second) {
      unchanged.push(field);
    } else {
      changed.push({ field, first, second });
    }
  }
  return { unchanged, changed };
}

/**
 * Short human-readable comparison for dashboards (not i18n).
 * Prefer {@link diffIdentityLinks} for structured UI.
 */
export function explainIdentityLinkRelationship(
  a: IdentityLink,
  b: IdentityLink,
): string {
  if (a.agentId !== b.agentId) {
    return "Different agent ids.";
  }
  const sameStatic = a.staticHash === b.staticHash;
  const sameRuntime = a.runtimeHash === b.runtimeHash;
  if (sameStatic && sameRuntime && a.agentName === b.agentName) {
    return "Same identity link.";
  }
  if (!sameStatic) {
    return "Different static identity (toolkit / definition changed).";
  }
  if (!sameRuntime) {
    return "Same static identity; runtime differs (enabled tools or policies changed).";
  }
  if (a.agentName !== b.agentName) {
    return "Same static and runtime hashes; display name differs only.";
  }
  return "Differ in ways not covered above.";
}

/**
 * Abbreviated hash for tables (e.g. `abc123…fedcba`). Returns short strings unchanged.
 */
export function formatHashShort(
  hash: string,
  options?: { prefix?: number; suffix?: number },
): string {
  const prefix = options?.prefix ?? 6;
  const suffix = options?.suffix ?? 6;
  if (!hash.length) {
    return hash;
  }
  if (hash.length <= prefix + suffix + 1) {
    return hash;
  }
  return `${hash.slice(0, prefix)}…${hash.slice(-suffix)}`;
}
