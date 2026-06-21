export const MAX_AVATAR_BYTE_SIZE = 2 * 1024 * 1024;

export function isAllowedAvatarMimeType(mimeType: string): boolean {
  return mimeType.trim().toLowerCase().startsWith("image/");
}
