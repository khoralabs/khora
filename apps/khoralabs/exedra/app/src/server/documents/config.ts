export const DEFAULT_DOCUMENTS_S3_PREFIX = "exedra/documents";
export const MAX_DOCUMENT_BYTE_SIZE = 25 * 1024 * 1024;

const ALLOWED_MIME_PREFIXES = ["text/", "image/", "audio/", "video/"] as const;
const ALLOWED_MIME_EXACT = new Set([
  "application/json",
  "application/xml",
  "application/yaml",
  "application/pdf",
  "application/javascript",
  "application/octet-stream",
]);

export function getDocumentsS3Bucket(): string | undefined {
  const value = process.env.EXEDRA_DOCUMENTS_S3_BUCKET?.trim();
  return value !== undefined && value.length > 0 ? value : undefined;
}

export function getDocumentsS3Prefix(): string {
  const value = process.env.EXEDRA_DOCUMENTS_S3_PREFIX?.trim();
  return value !== undefined && value.length > 0 ? value : DEFAULT_DOCUMENTS_S3_PREFIX;
}

export function getDocumentsS3Endpoint(): string | undefined {
  const value = process.env.EXEDRA_DOCUMENTS_S3_ENDPOINT?.trim();
  return value !== undefined && value.length > 0 ? value : undefined;
}

export function getDocumentsS3Region(): string {
  return process.env.AWS_REGION?.trim() || "us-east-1";
}

export function isAllowedDocumentMimeType(mimeType: string): boolean {
  const normalized = mimeType.trim().toLowerCase();
  if (normalized.length === 0) return false;
  if (ALLOWED_MIME_EXACT.has(normalized)) return true;
  return ALLOWED_MIME_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function sanitizeDocumentFileName(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop()?.trim() ?? "upload";
  const safe = base
    .replace(/[^\w.\-()+\s]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return safe.length > 0 ? safe.slice(0, 200) : "upload";
}
