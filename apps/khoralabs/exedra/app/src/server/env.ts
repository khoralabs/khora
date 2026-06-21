export function getInvitePepper(): string {
  const pepper = process.env.INVITE_PEPPER?.trim();
  if (pepper === undefined || pepper.length === 0) {
    throw new Error("INVITE_PEPPER is required");
  }
  return pepper;
}

export function getIdentityKey(): Buffer {
  const raw = process.env.EXEDRA_IDENTITY_KEY?.trim();
  if (raw === undefined || raw.length === 0) {
    throw new Error("EXEDRA_IDENTITY_KEY is required (32-byte hex)");
  }
  const key = Buffer.from(raw, "hex");
  if (key.length !== 32) {
    throw new Error("EXEDRA_IDENTITY_KEY must be 32 bytes (64 hex chars)");
  }
  return key;
}

export function getAiModel(): string {
  const model = process.env.AI_MODEL?.trim();
  return model !== undefined && model.length > 0 ? model : "gpt-4o";
}

export function getAiApiKey(): string | undefined {
  const key = process.env.AI_API_KEY?.trim();
  return key !== undefined && key.length > 0 ? key : undefined;
}

export function getAiBaseUrl(): string | undefined {
  const url = process.env.AI_BASE_URL?.trim();
  return url !== undefined && url.length > 0 ? url : undefined;
}

export function getKhoraHostUrl(): string | null {
  const url = process.env.KHORA_HOST_URL?.trim();
  if (url === undefined || url.length === 0) return null;
  return url.replace(/\/$/, "");
}

export function getKhoraHostSlug(): string | null {
  const slug = process.env.KHORA_HOST_SLUG?.trim();
  if (slug === undefined || slug.length === 0) return null;
  return slug;
}
