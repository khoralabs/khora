import path from "node:path";

import { getStorageRootPrefix } from "./config.js";

export type PrincipalKind = "organization" | "account";
export type PrincipalResource = "database" | "file";
export type FileCategory = "documents" | "knowledge" | "avatars";
export type DatabaseSidecarSuffix = "" | "-wal" | "-shm";

const PRINCIPAL_FOLDER: Record<PrincipalKind, string> = {
  organization: "organizations",
  account: "accounts",
};

export function validatePrincipalDid(did: string): string {
  const trimmed = did.trim();
  if (trimmed.length === 0) throw new Error("Principal DID is required");
  if (trimmed.includes("/") || trimmed.includes("\\")) {
    throw new Error("Principal DID must not contain path separators");
  }
  return trimmed;
}

function sanitizePathPart(part: string): string {
  const trimmed = part.trim();
  if (trimmed.length === 0) throw new Error("Storage path part is required");
  if (trimmed.includes("/") || trimmed.includes("\\")) {
    throw new Error("Storage path part must not contain path separators");
  }
  return trimmed;
}

export function principalStoragePrefix(params: { kind: PrincipalKind; did: string }): string {
  const did = validatePrincipalDid(params.did);
  const root = getStorageRootPrefix();
  return `${root}/${PRINCIPAL_FOLDER[params.kind]}/${did}`;
}

export function principalResourcePrefix(params: {
  kind: PrincipalKind;
  did: string;
  resource: PrincipalResource;
}): string {
  const base = principalStoragePrefix(params);
  return params.resource === "database" ? base : `${base}/files`;
}

export function databaseObjectKey(params: {
  kind: PrincipalKind;
  did: string;
  suffix?: DatabaseSidecarSuffix;
}): string {
  const did = validatePrincipalDid(params.did);
  const suffix = params.suffix ?? "";
  return `${principalStoragePrefix({ kind: params.kind, did })}/${did}.db${suffix}`;
}

export function fileObjectKey(params: {
  kind: PrincipalKind;
  did: string;
  category: FileCategory;
  parts: readonly string[];
}): string {
  const base = principalResourcePrefix({
    kind: params.kind,
    did: params.did,
    resource: "file",
  });
  const safeParts = params.parts.map(sanitizePathPart);
  return [base, params.category, ...safeParts].join("/");
}

export function localDatabasePath(params: {
  kind: PrincipalKind;
  did: string;
  memoriesDir: string;
  suffix?: DatabaseSidecarSuffix;
}): string {
  const did = validatePrincipalDid(params.did);
  const suffix = params.suffix ?? "";
  return path.join(params.memoriesDir, PRINCIPAL_FOLDER[params.kind], did, `${did}.db${suffix}`);
}

export function localDatabaseDir(params: {
  kind: PrincipalKind;
  did: string;
  memoriesDir: string;
}): string {
  const did = validatePrincipalDid(params.did);
  return path.join(params.memoriesDir, PRINCIPAL_FOLDER[params.kind], did);
}
