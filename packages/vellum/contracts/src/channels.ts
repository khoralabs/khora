import z from "zod";

export const zVellumAdmissionMode = z.enum(["invite_only"]);
export type VellumAdmissionMode = z.infer<typeof zVellumAdmissionMode>;

export const zVellumMaxChainsGlobal = z
  .object({ mode: z.literal("global"), measure: z.number().int().positive() })
  .strict();
export const zVellumMaxChainsPrincipal = z
  .object({ mode: z.literal("principal"), measure: z.number().int().positive() })
  .strict();

export const zVellumMaxChains = z.discriminatedUnion("mode", [
  zVellumMaxChainsGlobal,
  zVellumMaxChainsPrincipal,
]);
export type VellumMaxChains = z.infer<typeof zVellumMaxChains>;

export const DEFAULT_VELLUM_MAX_CHAINS: VellumMaxChains = { mode: "principal", measure: 8 };

/** Subprotocol prefix for one-time WS upgrade nonces (`Sec-WebSocket-Protocol`). */
export const VELLUM_WS_UPGRADE_NONCE_PROTOCOL_PREFIX = "vellum.nonce.";

export function vellumWsUpgradeProtocol(nonce: string): string {
  return `${VELLUM_WS_UPGRADE_NONCE_PROTOCOL_PREFIX}${nonce}`;
}

const zWsAttachFields = {
  webSocketUrl: z.string(),
  upgradeNonce: z.string().min(1),
  upgradeNonceExpiresAtMs: z.number().int().positive(),
};

export const zVellumChannelPolicy = z.object({
  admissionMode: zVellumAdmissionMode,
  maxPopulation: z.number().int().positive().optional(),
  maxChains: zVellumMaxChains,
});

export type VellumChannelPolicy = z.infer<typeof zVellumChannelPolicy>;

export const zVellumChannelCreateBody = z
  .object({
    ttlMs: z.number().int().positive().optional(),
    maxPopulation: z.number().int().positive().optional(),
    maxChains: zVellumMaxChains.optional(),
  })
  .strict();

export const zVellumChannelCreateResponse = z.object({
  channelId: z.string(),
  ticket: z.string(),
  ...zWsAttachFields,
  expiresAtMs: z.number().optional(),
  inviteToken: z.string().optional(),
  policy: zVellumChannelPolicy,
});

export const zVellumChannelJoinBody = z
  .object({
    inviteToken: z.string().min(1),
  })
  .strict();

export const zVellumChannelTicketResponse = z.object({
  channelId: z.string(),
  ticket: z.string(),
  ...zWsAttachFields,
  expiresAtMs: z.number().optional(),
  policy: zVellumChannelPolicy.optional(),
});

export const zVellumChannelWsNonceResponse = z.object({
  channelId: z.string(),
  ...zWsAttachFields,
});

export const zVellumChannelJoinTokenMintResponse = z.object({
  channelId: z.string(),
  joinToken: z.string().min(1),
  expiresAtMs: z.number().int().positive(),
});

export const zVellumChannelJoinResponse = zVellumChannelTicketResponse.extend({
  creatorDid: z.string(),
});

export const zVellumChannelChainAllocateBody = z
  .object({
    counterpartyDid: z.string().min(1),
    sessionId: z.string().min(1),
  })
  .strict();

export const zVellumChannelChainAllocateResponse = z.object({
  ok: z.literal(true),
  sessionId: z.string(),
});

export const zVellumChannelChainReleaseResponse = z.object({
  ok: z.literal(true),
});

export const zVellumChannelChainStatusResponse = z.object({
  allocated: z.literal(true),
  sessionId: z.string(),
});

export type VellumChannelCreateBody = z.infer<typeof zVellumChannelCreateBody>;
export type VellumChannelCreateResponse = z.infer<typeof zVellumChannelCreateResponse>;
export type VellumChannelJoinBody = z.infer<typeof zVellumChannelJoinBody>;
export type VellumChannelJoinResponse = z.infer<typeof zVellumChannelJoinResponse>;
export type VellumChannelTicketResponse = z.infer<typeof zVellumChannelTicketResponse>;
export type VellumChannelWsNonceResponse = z.infer<typeof zVellumChannelWsNonceResponse>;
export type VellumChannelJoinTokenMintResponse = z.infer<
  typeof zVellumChannelJoinTokenMintResponse
>;
export type VellumChannelChainAllocateBody = z.infer<typeof zVellumChannelChainAllocateBody>;
export type VellumChannelChainAllocateResponse = z.infer<
  typeof zVellumChannelChainAllocateResponse
>;
