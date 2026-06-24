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

export {
  getStorageRootPrefix as getDocumentsS3Prefix,
  getStorageS3Bucket as getDocumentsS3Bucket,
  getStorageS3Endpoint as getDocumentsS3Endpoint,
  getStorageS3Region as getDocumentsS3Region,
  isStorageConfigured as isDocumentsStorageConfigured,
} from "../storage/config.js";

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
