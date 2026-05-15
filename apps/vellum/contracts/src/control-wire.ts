/**
 * Daemon control-plane JSON over HTTP (`Bun.serve`).
 */
import { z } from "zod";

export const ChainInitWireSchema = z.object({
  session_id: z.string(),
  genesis_hash: z.string().regex(/^[0-9a-f]{64}$/),
  party_ids: z.tuple([z.string(), z.string()]),
  actor_pubkeys: z.tuple([z.string(), z.string()]),
});

export type ChainInitWire = z.infer<typeof ChainInitWireSchema>;

export const ChainInitRequestSchema = z.object({
  init: ChainInitWireSchema,
});

export type ChainInitRequest = z.infer<typeof ChainInitRequestSchema>;

export const TurnRequestSchema = z.object({
  sessionId: z.string(),
  body: z.record(z.string(), z.unknown()),
});

export type TurnRequest = z.infer<typeof TurnRequestSchema>;

export const ChainInitResponseSchema = z.object({
  ok: z.literal(true),
  session_id: z.string(),
});

export type ChainInitResponse = z.infer<typeof ChainInitResponseSchema>;

export const ChainStateResponseSchema = z.object({
  chains: z.array(
    z.object({
      session_id: z.string(),
      genesis_hash: z.string(),
    }),
  ),
  graphSummary: z
    .object({
      parties: z.number(),
      offers: z.number(),
      exposes: z.number(),
      binds: z.number(),
    })
    .optional(),
});

export type ChainStateResponse = z.infer<typeof ChainStateResponseSchema>;
