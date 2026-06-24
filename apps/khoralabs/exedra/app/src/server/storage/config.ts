export const DEFAULT_STORAGE_ROOT_PREFIX = "exedra";

export function getStorageRootPrefix(): string {
  const value = process.env.EXEDRA_DOCUMENTS_S3_PREFIX?.trim();
  return value !== undefined && value.length > 0
    ? value.replace(/\/+$/, "")
    : DEFAULT_STORAGE_ROOT_PREFIX;
}

export function getStorageS3Bucket(): string | undefined {
  const value = process.env.EXEDRA_DOCUMENTS_S3_BUCKET?.trim();
  return value !== undefined && value.length > 0 ? value : undefined;
}

export function getStorageS3Endpoint(): string | undefined {
  const value = process.env.EXEDRA_DOCUMENTS_S3_ENDPOINT?.trim();
  return value !== undefined && value.length > 0 ? value : undefined;
}

export function getStorageS3Region(): string {
  return process.env.AWS_REGION?.trim() || "us-east-1";
}

export function isStorageConfigured(): boolean {
  return getStorageS3Bucket() !== undefined;
}
