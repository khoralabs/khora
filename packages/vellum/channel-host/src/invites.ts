import { createHash } from "node:crypto";

export type ChannelInviteRecord = {
  channelId: string;
  creatorDid: string;
  expiresAtMs: number;
  consumedByDid?: string;
};

export function randomInviteToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createInviteStore() {
  const map = new Map<string, ChannelInviteRecord>();

  return {
    put(token: string, record: ChannelInviteRecord): void {
      map.set(hashInviteToken(token), record);
    },
    redeem(token: string, consumerDid: string, nowMs: number): ChannelInviteRecord | undefined {
      const key = hashInviteToken(token);
      const rec = map.get(key);
      if (rec === undefined) return undefined;
      if (rec.expiresAtMs <= nowMs) return undefined;
      if (rec.consumedByDid !== undefined) return undefined;
      rec.consumedByDid = consumerDid;
      return rec;
    },
  };
}

export type ChannelInviteStore = ReturnType<typeof createInviteStore>;
