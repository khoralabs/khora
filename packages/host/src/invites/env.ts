export function parseInviteSeedTokens(raw: string | undefined): string[] {
  if (raw === undefined) return [];
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function readInvitePepper(): string | undefined {
  const p = process.env.KHORA_INVITE_PEPPER?.trim();
  return p !== undefined && p.length > 0 ? p : undefined;
}

export function inviteRequiredFromEnv(): boolean {
  return process.env.KHORA_INVITE_REQUIRED?.trim() === "1";
}

export function invitesPerRegistrationFromEnv(): number {
  const raw = process.env.KHORA_INVITES_PER_REGISTRATION?.trim();
  if (raw === undefined || raw.length === 0) return 10;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 500) : 10;
}

export function validateInviteEnvConfig(seedTokens: string[]): void {
  if (inviteRequiredFromEnv() || seedTokens.length > 0) {
    const pepper = readInvitePepper();
    if (pepper === undefined || pepper.length === 0) {
      throw new Error(
        "Set KHORA_INVITE_PEPPER when KHORA_INVITE_REQUIRED=1 or KHORA_INVITE_SEED_TOKENS is non-empty.",
      );
    }
  }
}
