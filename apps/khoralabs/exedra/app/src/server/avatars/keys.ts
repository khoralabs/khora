import { fileObjectKey } from "../storage/paths.js";

export function avatarExtensionForMimeType(mimeType: string): string {
  const normalized = mimeType.trim().toLowerCase();
  if (normalized === "image/jpeg" || normalized === "image/jpg") return "jpg";
  if (normalized === "image/png") return "png";
  if (normalized === "image/gif") return "gif";
  if (normalized === "image/webp") return "webp";
  if (normalized === "image/svg+xml") return "svg";
  return "bin";
}

export function buildOrgAvatarS3Key(orgId: string, ext: string): string {
  return fileObjectKey({
    kind: "organization",
    did: orgId,
    category: "avatars",
    parts: ["org", `avatar.${ext}`],
  });
}

export function buildTeamAvatarS3Key(orgId: string, teamId: string, ext: string): string {
  return fileObjectKey({
    kind: "organization",
    did: orgId,
    category: "avatars",
    parts: ["teams", teamId, `avatar.${ext}`],
  });
}

export function buildUserAvatarS3Key(userId: string, ext: string): string {
  return fileObjectKey({
    kind: "account",
    did: userId,
    category: "avatars",
    parts: [`avatar.${ext}`],
  });
}
