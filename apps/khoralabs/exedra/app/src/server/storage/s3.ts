import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { getStorageS3Bucket, getStorageS3Endpoint, getStorageS3Region } from "./config.js";

let s3Client: S3Client | undefined;

function getS3Client(): S3Client {
  if (s3Client !== undefined) return s3Client;
  const endpoint = getStorageS3Endpoint();
  s3Client = new S3Client({
    region: getStorageS3Region(),
    ...(endpoint !== undefined
      ? {
          endpoint,
          forcePathStyle: true,
        }
      : {}),
  });
  return s3Client;
}

export function resetStorageS3ClientForTests(): void {
  s3Client = undefined;
}

function requireBucket(): string {
  const bucket = getStorageS3Bucket();
  if (bucket === undefined) {
    throw new Error("EXEDRA_DOCUMENTS_S3_BUCKET is not configured");
  }
  return bucket;
}

export async function putObject(params: {
  key: string;
  bytes: Uint8Array;
  mimeType: string;
  metadata?: Record<string, string>;
}): Promise<void> {
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: requireBucket(),
      Key: params.key,
      Body: params.bytes,
      ContentType: params.mimeType,
      ...(params.metadata !== undefined ? { Metadata: params.metadata } : {}),
    }),
  );
}

export async function getObject(key: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const response = await getS3Client().send(
    new GetObjectCommand({
      Bucket: requireBucket(),
      Key: key,
    }),
  );

  const body = response.Body;
  if (body === undefined) {
    throw new Error("Object not found in S3");
  }

  return {
    bytes: new Uint8Array(await body.transformToByteArray()),
    contentType: response.ContentType ?? "application/octet-stream",
  };
}

export async function deleteObject(key: string): Promise<void> {
  const bucket = getStorageS3Bucket();
  if (bucket === undefined) return;

  await getS3Client().send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
}
