import type { PrincipalRegistrationResult } from "@khoralabs/agent-relay";
import z from "zod";
import type { KhoraProfile } from "./khora-profile";
import { zKhoraProfile } from "./khora-profile";

/** HTTP body for `POST /v1/register` (swarm fields + optional Khora invite). */
export const zKhoraRegisterResult = z.object({
  did: z.string(),
  profileId: z.string(),
  profile: zKhoraProfile,
  inviteTokens: z.array(z.string()).optional(),
});

export type KhoraRegisterResultParsed = z.infer<typeof zKhoraRegisterResult>;

export const zKhoraRegistrationRequestBody = z.object({
  did: z.string().trim().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
  correlationId: z.string().optional(),
  inviteToken: z.string().trim().min(1).optional(),
});

export type KhoraRegistrationRequestBody = z.infer<typeof zKhoraRegistrationRequestBody>;

/** Signed body for `POST /v1/unregister` (same DID field as registration). */
export const zKhoraUnregisterRequestBody = z.object({
  did: z.string().trim().min(1),
  correlationId: z.string().optional(),
});

export type KhoraUnregisterRequestBody = z.infer<typeof zKhoraUnregisterRequestBody>;

export const zKhoraInviteListItem = z.object({
  preview: z.string(),
  consumed: z.boolean(),
  consumedByDid: z.string().optional(),
  createdAtMs: z.number(),
  kind: z.string(),
});

export const zKhoraInviteListResponse = z.object({
  invites: z.array(zKhoraInviteListItem),
});

export type KhoraInviteListResponse = z.infer<typeof zKhoraInviteListResponse>;

export const zKhoraInvitePreviewResponse = z.object({
  inviter: z.union([
    z.null(),
    z.object({
      did: z.string(),
      profile: zKhoraProfile.nullable(),
    }),
  ]),
  source: z.enum(["inviter", "root", "seed"]),
});

export type KhoraInvitePreviewResponse = z.infer<typeof zKhoraInvitePreviewResponse>;

/** HTTP uses `did`; agent-relay uses opaque `principalId` (same string at runtime). */
export type KhoraRegistrationResult = Omit<
  PrincipalRegistrationResult<KhoraProfile>,
  "principalId"
> & {
  did: string;
  inviteTokens?: string[];
};
