import z from "zod";

export const zVellumChannelCreateBody = z
  .object({
    ttlMs: z.number().int().positive().optional(),
  })
  .strict();

export const zVellumChannelCreateResponse = z.object({
  channelId: z.string(),
  ticket: z.string(),
  webSocketUrl: z.string(),
  expiresAtMs: z.number().optional(),
  inviteToken: z.string().optional(),
});

export const zVellumChannelJoinBody = z
  .object({
    inviteToken: z.string().min(1),
  })
  .strict();

export const zVellumChannelTicketResponse = z.object({
  channelId: z.string(),
  ticket: z.string(),
  webSocketUrl: z.string(),
  expiresAtMs: z.number().optional(),
});

export const zVellumChannelJoinResponse = zVellumChannelTicketResponse.extend({
  creatorDid: z.string(),
});

export type VellumChannelCreateBody = z.infer<typeof zVellumChannelCreateBody>;
export type VellumChannelCreateResponse = z.infer<typeof zVellumChannelCreateResponse>;
export type VellumChannelJoinBody = z.infer<typeof zVellumChannelJoinBody>;
export type VellumChannelJoinResponse = z.infer<typeof zVellumChannelJoinResponse>;
export type VellumChannelTicketResponse = z.infer<typeof zVellumChannelTicketResponse>;
