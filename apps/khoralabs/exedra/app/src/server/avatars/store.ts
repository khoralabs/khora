import { deleteObject, getObject, isStorageConfigured, putObject } from "../storage/index.js";

export function resetAvatarsS3ClientForTests(): void {
  // S3 client is shared via storage module; reset handled there when needed.
}

export function isAvatarStorageConfigured(): boolean {
  return isStorageConfigured();
}

export async function putAvatarObject(params: {
  s3Key: string;
  mimeType: string;
  bytes: Uint8Array;
}): Promise<void> {
  await putObject({
    key: params.s3Key,
    bytes: params.bytes,
    mimeType: params.mimeType,
  });
}

export async function getAvatarObject(
  s3Key: string,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  return getObject(s3Key);
}

export async function deleteAvatarObject(s3Key: string): Promise<void> {
  await deleteObject(s3Key);
}

export { resetStorageS3ClientForTests } from "../storage/s3.js";
