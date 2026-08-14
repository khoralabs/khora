export type KhoraInviteListRow = {
  preview: string;
  consumed: boolean;
  consumedByDid: string | undefined;
  createdAtMs: number;
  kind: string;
};

export type KhoraInviteAdminListRow = KhoraInviteListRow & {
  mintedByDid: string | null;
};

export type InvitePreviewResult =
  | {
      ok: true;
      inviter: { did: string; profile: unknown } | null;
      source: "inviter" | "root" | "seed";
    }
  | { ok: false };

export type KhoraInvitesRepo = {
  insertSeedInviteTokens(plaintexts: string[]): number;
  ensureRootInviteIfAbsent(): string | undefined;
  tryConsumeInviteToken(plaintext: string, consumerDid: string): boolean;
  rollbackInviteConsumption(plaintext: string, consumerDid: string): void;
  mintStandardInviteTokens(mintedByDid: string, count: number): string[];
  listInvitesMintedForDid(minterDid: string): KhoraInviteListRow[];
  listAllInviteTokens(params?: { limit?: number; mintedByDid?: string }): KhoraInviteAdminListRow[];
  previewInviteToken(
    plaintext: string,
    loadProfileForDid: (did: string) => unknown | null | undefined,
  ): InvitePreviewResult;
  /** Delete all invite tokens minted by or consumed by the given principal (called on principal teardown). */
  deleteTokensForPrincipal(did: string): void;
};
