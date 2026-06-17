export type AvatarKind = "user" | "org" | "team";

export function buildAvatarServeUrl(kind: AvatarKind, id: string): string {
  return `/api/avatars/${kind}/${encodeURIComponent(id)}`;
}

export function avatarUrlFromS3Key(
  kind: AvatarKind,
  entityId: string,
  avatarS3Key: string | null | undefined,
): string | null {
  if (avatarS3Key === null || avatarS3Key === undefined || avatarS3Key.length === 0) {
    return null;
  }
  return buildAvatarServeUrl(kind, entityId);
}
