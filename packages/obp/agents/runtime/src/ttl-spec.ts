import type { NegotiationPortTtlBasis } from "@cfd/obp-core";
import z from "zod";

export type TtlBasis = NegotiationPortTtlBasis;
export type TtlSpec = { basis: TtlBasis; measure: number };

const TTL_BASES = ["turns", "ledger_seq"] as const satisfies readonly NegotiationPortTtlBasis[];

export const zTtlSpec = z
  .object({
    basis: z.enum(TTL_BASES),
    measure: z.number().int().min(1),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.basis === "turns" && v.measure > 10_000) {
      ctx.addIssue({
        code: "custom",
        message: "turns: measure must be <= 10000",
      });
    }
    if (v.basis === "ledger_seq" && v.measure > 1_000_000_000) {
      ctx.addIssue({
        code: "custom",
        message: "ledger_seq: measure must be <= 1000000000",
      });
    }
  });
