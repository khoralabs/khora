import { ResourceType, ScopeType } from "../authz/policy.js";
import type { DocumentGrantResource } from "../documents/types.js";
import { type FileCategory, fileObjectKey, type PrincipalKind } from "./paths.js";

export type DocumentStorageOwner = {
  kind: PrincipalKind;
  did: string;
  category: FileCategory;
};

export function resolveDocumentStorageOwner(params: {
  grantResource: DocumentGrantResource;
  orgId: string;
  userId: string;
}): DocumentStorageOwner {
  if (params.grantResource.type === ScopeType.Account) {
    return { kind: "account", did: params.userId, category: "knowledge" };
  }

  if (params.grantResource.type === ResourceType.Session) {
    return { kind: "organization", did: params.orgId, category: "documents" };
  }

  const orgDid = params.orgId.trim();
  if (orgDid.length === 0 || orgDid === "personal") {
    return { kind: "account", did: params.userId, category: "knowledge" };
  }

  return { kind: "organization", did: orgDid, category: "knowledge" };
}

export function buildDocumentFileObjectKey(params: {
  owner: DocumentStorageOwner;
  batchId: string;
  documentId: string;
  fileName: string;
}): string {
  return fileObjectKey({
    kind: params.owner.kind,
    did: params.owner.did,
    category: params.owner.category,
    parts: ["batches", params.batchId, params.documentId, params.fileName],
  });
}
