import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { ContentAddressedStore } from "@khoralabs/sourcemaps";

import {
  getDocumentsS3Bucket,
  getDocumentsS3Endpoint,
  getDocumentsS3Prefix,
  getDocumentsS3Region,
  sanitizeDocumentFileName,
} from "./config.js";
import { sha256Hex } from "./hash.js";
import type { ExedraDocumentLocators, ExedraDocumentRef } from "./types.js";

let s3Client: S3Client | undefined;

function getS3Client(): S3Client {
  if (s3Client !== undefined) return s3Client;
  const endpoint = getDocumentsS3Endpoint();
  s3Client = new S3Client({
    region: getDocumentsS3Region(),
    ...(endpoint !== undefined
      ? {
          endpoint,
          forcePathStyle: true,
        }
      : {}),
  });
  return s3Client;
}

export function resetDocumentsS3ClientForTests(): void {
  s3Client = undefined;
}

export function buildDocumentS3Key(params: {
  orgId: string;
  batchId: string;
  documentId: string;
  fileName: string;
}): string {
  const prefix = getDocumentsS3Prefix().replace(/\/+$/, "");
  const safeName = sanitizeDocumentFileName(params.fileName);
  return `${prefix}/org/${params.orgId}/batch/${params.batchId}/${params.documentId}/${safeName}`;
}

export class ExedraDocumentStore implements ContentAddressedStore<ExedraDocumentRef> {
  async put(params: {
    orgId: string;
    batchId: string;
    documentId: string;
    fileName: string;
    mimeType: string;
    bytes: Uint8Array;
  }): Promise<{ ref: ExedraDocumentRef; s3Key: string }> {
    const bucket = getDocumentsS3Bucket();
    if (bucket === undefined) {
      throw new Error("EXEDRA_DOCUMENTS_S3_BUCKET is not configured");
    }

    const contentHash = await sha256Hex(params.bytes);
    const s3Key = buildDocumentS3Key(params);
    const ref: ExedraDocumentRef = {
      domain: "exedra_document",
      org_id: params.orgId,
      batch_id: params.batchId,
      document_id: params.documentId,
      file_name: sanitizeDocumentFileName(params.fileName),
      content_hash: contentHash,
    };

    await getS3Client().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: s3Key,
        Body: params.bytes,
        ContentType: params.mimeType,
        Metadata: {
          content_hash: contentHash,
          document_id: params.documentId,
          batch_id: params.batchId,
        },
      }),
    );

    return { ref, s3Key };
  }

  async resolve(ref: ExedraDocumentRef): Promise<{ kind: "blob"; blob: Blob }> {
    const s3Key = buildDocumentS3Key({
      orgId: ref.org_id,
      batchId: ref.batch_id,
      documentId: ref.document_id,
      fileName: ref.file_name,
    });
    return this.getByS3Key({
      s3Key,
      contentHash: ref.content_hash,
    });
  }

  async getByS3Key(params: {
    s3Key: string;
    contentHash: string;
    mimeType?: string;
  }): Promise<{ kind: "blob"; blob: Blob }> {
    const bucket = getDocumentsS3Bucket();
    if (bucket === undefined) {
      throw new Error("EXEDRA_DOCUMENTS_S3_BUCKET is not configured");
    }

    const response = await getS3Client().send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: params.s3Key,
      }),
    );

    const body = response.Body;
    if (body === undefined) {
      throw new Error("Document object not found in S3");
    }

    const bytes = new Uint8Array(await body.transformToByteArray());
    const contentHash = await sha256Hex(bytes);
    if (contentHash !== params.contentHash) {
      throw new Error("Document content hash mismatch");
    }

    return {
      kind: "blob",
      blob: new Blob([bytes], {
        type: params.mimeType ?? response.ContentType ?? "application/octet-stream",
      }),
    };
  }

  async deleteByS3Key(s3Key: string): Promise<void> {
    const bucket = getDocumentsS3Bucket();
    if (bucket === undefined) return;

    await getS3Client().send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: s3Key,
      }),
    );
  }

  async deleteByRef(ref: ExedraDocumentRef): Promise<void> {
    const bucket = getDocumentsS3Bucket();
    if (bucket === undefined) return;

    const s3Key = buildDocumentS3Key({
      orgId: ref.org_id,
      batchId: ref.batch_id,
      documentId: ref.document_id,
      fileName: ref.file_name,
    });

    await getS3Client().send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: s3Key,
      }),
    );
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
