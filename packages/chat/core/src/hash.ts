import type { Mention, ScopeRef, SignedEnvelope } from "./types.ts";

export function sha256Hex(input: string | Uint8Array): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(input);
  return hasher.digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

export type CanonicalPostVersionPayload = {
  postId: string;
  versionId: string;
  threadId: string;
  author: ScopeRef;
  role: string;
  parts: unknown[];
  metadata?: unknown;
  mentions?: Mention[];
  model?: unknown;
  usage?: unknown;
  parentVersionId?: string | null;
  previousPostVersionId?: string | null;
};

export function canonicalPostVersionPayload(input: CanonicalPostVersionPayload): string {
  return stableStringify({
    postId: input.postId,
    versionId: input.versionId,
    threadId: input.threadId,
    author: input.author,
    role: input.role,
    parts: input.parts,
    metadata: input.metadata ?? null,
    mentions: input.mentions ?? null,
    model: input.model ?? null,
    usage: input.usage ?? null,
    parentVersionId: input.parentVersionId ?? null,
    previousPostVersionId: input.previousPostVersionId ?? null,
  });
}

export function computeContentHash(payload: CanonicalPostVersionPayload): string {
  return sha256Hex(canonicalPostVersionPayload(payload));
}

export function computeLineageHash(input: {
  previousLineageHash: string | null;
  contentHash: string;
  postId: string;
  versionId: string;
}): string {
  return sha256Hex(
    stableStringify({
      previousLineageHash: input.previousLineageHash,
      contentHash: input.contentHash,
      postId: input.postId,
      versionId: input.versionId,
    }),
  );
}

export type CanonicalAclEventPayload = {
  type: string;
  targetType: "channel" | "thread";
  targetId: string;
  scope?: ScopeRef;
  role?: string;
  actor: ScopeRef;
  previousAclEventId?: string | null;
};

export function canonicalAclEventPayload(input: CanonicalAclEventPayload): string {
  return stableStringify({
    type: input.type,
    targetType: input.targetType,
    targetId: input.targetId,
    scope: input.scope ?? null,
    role: input.role ?? null,
    actor: input.actor,
    previousAclEventId: input.previousAclEventId ?? null,
  });
}

export function computeAclEventContentHash(payload: CanonicalAclEventPayload): string {
  return sha256Hex(canonicalAclEventPayload(payload));
}

export function signedPayloadBytes(payload: string): Uint8Array {
  return new TextEncoder().encode(payload);
}

export type SignablePostVersion = CanonicalPostVersionPayload & {
  contentHash: string;
  lineageHash: string;
};

export function canonicalSignedPostVersionPayload(input: SignablePostVersion): string {
  return stableStringify({
    contentHash: input.contentHash,
    lineageHash: input.lineageHash,
    payload: JSON.parse(canonicalPostVersionPayload(input)),
  });
}

export function canonicalSignedAclEventPayload(input: {
  contentHash: string;
  payload: CanonicalAclEventPayload;
}): string {
  return stableStringify({
    contentHash: input.contentHash,
    payload: JSON.parse(canonicalAclEventPayload(input.payload)),
  });
}

export async function maybeSignPayload(
  payload: string,
  signer: ScopeRef,
  sign: (payload: Uint8Array, signer: ScopeRef) => Promise<SignedEnvelope>,
): Promise<SignedEnvelope | undefined> {
  return sign(signedPayloadBytes(payload), signer);
}
