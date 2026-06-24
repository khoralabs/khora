import type { ContentAddressedStore } from "@khoralabs/sourcemaps";

import {
  buildDocumentFileObjectKey,
  deleteObject,
  getObject,
  putObject,
  resolveDocumentStorageOwner,
} from "../storage/index.js";
import { sanitizeDocumentFileName } from "./config.js";
import { sha256Hex } from "./hash.js";
import type { DocumentGrantResource, ExedraDocumentLocators, ExedraDocumentRef } from "./types.js";

export function buildDocumentS3Key(params: {
  grantResource: DocumentGrantResource;
  orgId: string;
  userId: string;
  batchId: string;
  documentId: string;
  fileName: string;
}): string {
  const owner = resolveDocumentStorageOwner({
    grantResource: params.grantResource,
    orgId: params.orgId,
    userId: params.userId,
  });
  return buildDocumentFileObjectKey({
    owner,
    batchId: params.batchId,
    documentId: params.documentId,
    fileName: sanitizeDocumentFileName(params.fileName),
  });
}

export class ExedraDocumentStore implements ContentAddressedStore<ExedraDocumentRef> {
  async put(params: {
    grantResource: DocumentGrantResource;
    orgId: string;
    userId: string;
    batchId: string;
    documentId: string;
    fileName: string;
    mimeType: string;
    bytes: Uint8Array;
  }): Promise<{ ref: ExedraDocumentRef; s3Key: string }> {
    const contentHash = await sha256Hex(params.bytes);
    const safeFileName = sanitizeDocumentFileName(params.fileName);
    const s3Key = buildDocumentS3Key({
      grantResource: params.grantResource,
      orgId: params.orgId,
      userId: params.userId,
      batchId: params.batchId,
      documentId: params.documentId,
      fileName: safeFileName,
    });
    const ref: ExedraDocumentRef = {
      domain: "exedra_document",
      org_id: params.orgId,
      batch_id: params.batchId,
      document_id: params.documentId,
      file_name: safeFileName,
      content_hash: contentHash,
    };

    await putObject({
      key: s3Key,
      bytes: params.bytes,
      mimeType: params.mimeType,
      metadata: {
        content_hash: contentHash,
        document_id: params.documentId,
        batch_id: params.batchId,
      },
    });

    return { ref, s3Key };
  }

  async resolve(_ref: ExedraDocumentRef): Promise<{ kind: "blob"; blob: Blob }> {
    throw new Error(
      "Resolve document by stored s3_key; ExedraDocumentRef no longer encodes storage owner",
    );
  }

  async getByS3Key(params: {
    s3Key: string;
    contentHash: string;
    mimeType?: string;
  }): Promise<{ kind: "blob"; blob: Blob }> {
    const { bytes, contentType } = await getObject(params.s3Key);
    const contentHash = await sha256Hex(bytes);
    if (contentHash !== params.contentHash) {
      throw new Error("Document content hash mismatch");
    }

    return {
      kind: "blob",
      blob: new Blob([bytes], {
        type: params.mimeType ?? contentType,
      }),
    };
  }

  async deleteByS3Key(s3Key: string): Promise<void> {
    await deleteObject(s3Key);
  }

  async deleteByRef(_ref: ExedraDocumentRef): Promise<void> {
    throw new Error("Delete document by stored s3_key");
  }
}

export function buildExedraDocumentRef(params: {
  orgId: string;
  batchId: string;
  documentId: string;
  fileName: string;
  contentHash: string;
}): ExedraDocumentRef {
  return {
    domain: "exedra_document",
    org_id: params.orgId,
    batch_id: params.batchId,
    document_id: params.documentId,
    file_name: sanitizeDocumentFileName(params.fileName),
    content_hash: params.contentHash,
  };
}

export function refFromLocators(
  locators: ExedraDocumentLocators,
  contentHash: string,
): ExedraDocumentRef {
  return {
    ...locators,
    content_hash: contentHash,
  };
}

export { resetStorageS3ClientForTests as resetDocumentsS3ClientForTests } from "../storage/s3.js";
