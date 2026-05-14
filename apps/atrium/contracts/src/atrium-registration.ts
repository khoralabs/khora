import type { PrincipalRegistrationResult } from "@khoralabs/swarm-host";
import z from "zod";
import type { AtriumProfile } from "./atrium-profile.ts";
import { zAtriumProfile } from "./atrium-profile.ts";

/** HTTP body for `POST /v1/register` (swarm fields + optional Atrium invite). */
export const zAtriumRegisterResult = z.object({
  did: z.string(),
  profileId: z.string(),
  profile: zAtriumProfile,
  inviteTokens: z.array(z.string()).optional(),
});

export type AtriumRegisterResultParsed = z.infer<typeof zAtriumRegisterResult>;

export const zAtriumRegistrationRequestBody = z.object({
  did: z.string().trim().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
  correlationId: z.string().optional(),
  inviteToken: z.string().trim().min(1).optional(),
});

export type AtriumRegistrationRequestBody = z.infer<typeof zAtriumRegistrationRequestBody>;

export const zAtriumInviteListItem = z.object({
  preview: z.string(),
  consumed: z.boolean(),
  consumedByDid: z.string().optional(),
  createdAtMs: z.number(),
  kind: z.string(),
});

export const zAtriumInviteListResponse = z.object({
  invites: z.array(zAtriumInviteListItem),
});

export type AtriumInviteListResponse = z.infer<typeof zAtriumInviteListResponse>;

export const zAtriumInvitePreviewResponse = z.object({
  inviter: z.union([
    z.null(),
    z.object({
      did: z.string(),
      profile: zAtriumProfile.nullable(),
    }),
  ]),
  source: z.enum(["inviter", "root", "seed"]),
});

export type AtriumInvitePreviewResponse = z.infer<typeof zAtriumInvitePreviewResponse>;

/** HTTP uses `did`; swarm-host uses opaque `principalId` (same string at runtime). */
export type AtriumRegistrationResult = Omit<
  PrincipalRegistrationResult<AtriumProfile>,
  "principalId"
> & {
  did: string;
  inviteTokens?: string[];
};
