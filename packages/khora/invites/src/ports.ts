export type KhoraInviteListRow = {
  preview: string;
  consumed: boolean;
  consumedByDid: string | undefined;
  createdAtMs: number;
  kind: string;
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
  previewInviteToken(
    plaintext: string,
    loadProfileForDid: (did: string) => unknown | null | undefined,
  ): InvitePreviewResult;
};
