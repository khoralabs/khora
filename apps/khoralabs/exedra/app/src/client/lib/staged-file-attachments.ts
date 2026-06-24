import type { FileUIPart } from "ai";
import { nanoid } from "nanoid";

export const MAX_STAGED_FILES = 10;

export type PendingFile = FileUIPart & { id: string; file: File };

export function fileToAttachment(file: File): PendingFile {
  const id = nanoid();
  return {
    type: "file",
    id,
    filename: file.name,
    mediaType: file.type || "application/octet-stream",
    url: URL.createObjectURL(file),
    file,
  };
}

export function addStagedFiles(
  current: PendingFile[],
  files: FileList | File[],
  maxFiles = MAX_STAGED_FILES,
): PendingFile[] {
  const incoming = Array.from(files);
  if (incoming.length === 0) return current;
  const remaining = maxFiles - current.length;
  if (remaining <= 0) return current;
  return [...current, ...incoming.slice(0, remaining).map(fileToAttachment)];
}

export function removeStagedAttachment(current: PendingFile[], id: string): PendingFile[] {
  const removed = current.find((attachment) => attachment.id === id);
  if (removed?.url.startsWith("blob:")) URL.revokeObjectURL(removed.url);
  return current.filter((attachment) => attachment.id !== id);
}

export function revokeStagedAttachments(attachments: readonly PendingFile[]): void {
  for (const attachment of attachments) {
    if (attachment.url.startsWith("blob:")) URL.revokeObjectURL(attachment.url);
  }
}
