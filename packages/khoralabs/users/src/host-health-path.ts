export class InvalidHostHealthPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidHostHealthPathError";
  }
}

export function normalizeHostHealthPath(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new InvalidHostHealthPathError("health path is empty");
  }
  if (trimmed.includes("?") || trimmed.includes("#")) {
    throw new InvalidHostHealthPathError("health path must not include query or hash");
  }
  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  if (path.length > 1 && path.endsWith("/")) {
    throw new InvalidHostHealthPathError("health path must not end with /");
  }
  return path;
}
