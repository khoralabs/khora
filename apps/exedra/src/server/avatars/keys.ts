import { getDocumentsS3Prefix } from "../documents/config.js";

function prefixRoot(): string {
  return getDocumentsS3Prefix().replace(/\/+$/, "");
}

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
  return `${prefixRoot()}/org/${orgId}/avatars/org/avatar.${ext}`;
}

export function buildTeamAvatarS3Key(orgId: string, teamId: string, ext: string): string {
  return `${prefixRoot()}/org/${orgId}/avatars/team/${teamId}/avatar.${ext}`;
}

export function buildUserAvatarS3Key(orgId: string, userId: string, ext: string): string {
  return `${prefixRoot()}/org/${orgId}/avatars/user/${userId}/avatar.${ext}`;
}
