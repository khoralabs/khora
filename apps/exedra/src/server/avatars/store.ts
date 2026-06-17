import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import {
  getDocumentsS3Bucket,
  getDocumentsS3Endpoint,
  getDocumentsS3Region,
} from "../documents/config.js";

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

export function resetAvatarsS3ClientForTests(): void {
  s3Client = undefined;
}

export function isAvatarStorageConfigured(): boolean {
  return getDocumentsS3Bucket() !== undefined;
}

export async function putAvatarObject(params: {
  s3Key: string;
  mimeType: string;
  bytes: Uint8Array;
}): Promise<void> {
  const bucket = getDocumentsS3Bucket();
  if (bucket === undefined) {
    throw new Error("EXEDRA_DOCUMENTS_S3_BUCKET is not configured");
  }

  await getS3Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: params.s3Key,
      Body: params.bytes,
      ContentType: params.mimeType,
    }),
  );
}

export async function getAvatarObject(
  s3Key: string,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const bucket = getDocumentsS3Bucket();
  if (bucket === undefined) {
    throw new Error("EXEDRA_DOCUMENTS_S3_BUCKET is not configured");
  }

  const response = await getS3Client().send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: s3Key,
    }),
  );

  const body = response.Body;
  if (body === undefined) {
    throw new Error("Avatar object not found in S3");
  }

  return {
    bytes: new Uint8Array(await body.transformToByteArray()),
    contentType: response.ContentType ?? "application/octet-stream",
  };
}

export async function deleteAvatarObject(s3Key: string): Promise<void> {
  const bucket = getDocumentsS3Bucket();
  if (bucket === undefined) return;

  await getS3Client().send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: s3Key,
    }),
  );
}
