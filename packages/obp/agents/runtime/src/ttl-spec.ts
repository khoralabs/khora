import type { NegotiationPortTtlBasis } from "@cfd/obp-core";
import { MAX_EXPIRY_HOURS } from "@cfd/obp-tools";
import z from "zod";

export type TtlBasis = NegotiationPortTtlBasis;
export type TtlSpec = { basis: TtlBasis; measure: number };

const TTL_BASES = [
  "turns",
  "seconds",
  "minutes",
  "hours",
  "days",
] as const satisfies readonly NegotiationPortTtlBasis[];

export const zTtlSpec = z
  .object({
    basis: z.enum(TTL_BASES),
    measure: z.number().int().min(1),
  })
  .strict()
  .superRefine((v, ctx) => {
    const cap = (max: number, label: string) => {
      if (v.measure > max) {
        ctx.addIssue({
          code: "custom",
          message: `${label}: measure must be <= ${max}`,
        });
      }
    };
    switch (v.basis) {
      case "turns":
        cap(10_000, "turns");
        break;
      case "hours":
        cap(MAX_EXPIRY_HOURS, "hours");
        break;
      case "minutes":
        cap(MAX_EXPIRY_HOURS * 60, "minutes");
        break;
      case "seconds":
        cap(MAX_EXPIRY_HOURS * 3600, "seconds");
        break;
      case "days":
        cap(3660, "days");
        break;
      default: {
        const _ex: never = v.basis;
        void _ex;
      }
    }
  });
