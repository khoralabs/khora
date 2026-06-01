import type { AgentSigner } from "@khoralabs/agent-persisted-signer";
import type {
  KhoraPostCreateContent,
  KhoraPostPatch,
  KhoraStandingSearchRequest,
} from "@khoralabs/khora-contracts";
import { verifyAsync } from "@noble/ed25519";
import { DIDKey } from "iso-did/key";
import { AuthStrategyError } from "./strategy";
import { envelopeSignatureBytes, signatureBytesToB64Url } from "./wire";

export const KHORA_POST_SIGNATURE_V1 = 1 as const;

export type KhoraPostSigningPayloadV1 = {
  v: typeof KHORA_POST_SIGNATURE_V1;
  authorDid: string;
  kind: "post" | "status" | "subscription";
  topics?: string[];
  visibility?: "public" | "network" | "private";
  expiresAtMs?: number;
  title?: string;
  body: string;
  search?: KhoraStandingSearchRequest;
};

function stableStringify(v: unknown): string {
  if (v === undefined) {
    return "null";
  }
  if (v === null || typeof v !== "object") {
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) {
    return `[${v.map(stableStringify).join(",")}]`;
  }
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(",")}}`;
}

export function canonicalKhoraPostSigningPayload(payload: KhoraPostSigningPayloadV1): Uint8Array {
  return new TextEncoder().encode(stableStringify(payload));
}

export function khoraPostSigningPayloadFromCreate(
  authorDid: string,
  content: KhoraPostCreateContent,
): KhoraPostSigningPayloadV1 {
  const kind = content.kind ?? "post";
  const visibility = content.visibility ?? "public";
  return {
    v: KHORA_POST_SIGNATURE_V1,
    authorDid,
    kind,
    ...(content.topics !== undefined ? { topics: content.topics } : {}),
    ...(visibility !== "public" ? { visibility } : {}),
    ...(content.expiresAtMs !== undefined ? { expiresAtMs: content.expiresAtMs } : {}),
    ...(content.title !== undefined ? { title: content.title } : {}),
    body: content.body ?? "",
    ...(content.search !== undefined ? { search: content.search } : {}),
  };
}

export function khoraPostSigningPayloadFromPatch(
  authorDid: string,
  merged: {
    kind: "post" | "status" | "subscription";
    topics?: string[];
    visibility?: "public" | "network" | "private";
    expiresAtMs?: number;
    title?: string;
    body: string;
    search?: KhoraStandingSearchRequest;
  },
): KhoraPostSigningPayloadV1 {
  return {
    v: KHORA_POST_SIGNATURE_V1,
    authorDid,
    kind: merged.kind,
    ...(merged.topics !== undefined ? { topics: merged.topics } : {}),
    ...(merged.visibility !== undefined && merged.visibility !== "public"
      ? { visibility: merged.visibility }
      : {}),
    ...(merged.expiresAtMs !== undefined ? { expiresAtMs: merged.expiresAtMs } : {}),
    ...(merged.title !== undefined ? { title: merged.title } : {}),
    body: merged.body ?? "",
    ...(merged.search !== undefined ? { search: merged.search } : {}),
  };
}

export async function signKhoraPostPayload(
  signer: AgentSigner,
  payload: KhoraPostSigningPayloadV1,
): Promise<string> {
  if (payload.authorDid !== signer.did) {
    throw new Error("signKhoraPostPayload: authorDid must match signer.did");
  }
  const message = canonicalKhoraPostSigningPayload(payload);
  const sigBytes = await signer.sign(message);
  return signatureBytesToB64Url(sigBytes);
}

function publicKeyForDid(did: string): Uint8Array {
  let parsed: DIDKey;
  try {
    parsed = DIDKey.fromString(did);
  } catch {
    throw new AuthStrategyError(`unknown did:key: ${did}`);
  }
  if (parsed.type !== "Ed25519") {
    throw new AuthStrategyError(`unsupported did:key type: ${parsed.type}`);
  }
  return parsed.publicKey;
}

export async function verifyKhoraPostSignature(args: {
  authorDid: string;
  authorSignature: string;
  payload: KhoraPostSigningPayloadV1;
}): Promise<void> {
  if (args.payload.authorDid !== args.authorDid) {
    throw new AuthStrategyError("post signature authorDid mismatch");
  }
  const pubKey = publicKeyForDid(args.authorDid);
  const message = canonicalKhoraPostSigningPayload(args.payload);
  const ok = await verifyAsync(
    envelopeSignatureBytes({
      did: args.authorDid,
      timestampMs: 0,
      nonce: "",
      signatureB64Url: args.authorSignature,
    }),
    message,
    pubKey,
  );
  if (!ok) {
    throw new AuthStrategyError("post content signature invalid");
  }
}

export function signingPayloadForPatch(
  authorDid: string,
  previous: {
    kind: "post" | "status" | "subscription";
    topics?: string[];
    visibility?: "public" | "network" | "private";
    expiresAtMs?: number;
    title?: string;
    body: string;
    search?: KhoraPostPatch["search"];
  },
  patch: Omit<KhoraPostPatch, "authorSignature">,
): KhoraPostSigningPayloadV1 {
  return khoraPostSigningPayloadFromPatch(authorDid, {
    kind: patch.kind ?? previous.kind,
    topics: patch.topics ?? previous.topics,
    visibility: patch.visibility ?? previous.visibility,
    expiresAtMs: patch.expiresAtMs ?? previous.expiresAtMs,
    title: patch.title ?? previous.title,
    body: patch.body ?? previous.body ?? "",
    search: patch.search ?? previous.search,
  });
}
