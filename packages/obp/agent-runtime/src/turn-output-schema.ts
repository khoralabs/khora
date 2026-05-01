import type { SourceMapRef } from "@cfd/obp-core";
import { zOptionalSourcemaps } from "@cfd/obp-tools";
import z from "zod";
import type { TtlSpec } from "./ttl-spec.ts";
import { zTtlSpec } from "./ttl-spec.ts";

export type NegotiationTurnSchemaOptions = {
  /** When false, structured output must not include `ttl`; host applies defaults only. */
  allowAgentPortTtl: boolean;
};

function zExposePortEntry(opts: NegotiationTurnSchemaOptions) {
  const base = {
    portType: z.string().min(1).max(600),
    max_bindings: z.number().int().min(0).max(100).optional(),
    terminal: z.boolean(),
    ref: z.string().max(200).optional(),
    sourcemaps: zOptionalSourcemaps,
  };
  if (opts.allowAgentPortTtl) {
    return z.object({ ...base, ttl: zTtlSpec.optional() }).strict();
  }
  return z.object(base).strict();
}

/**
 * Bind turn: model picks **`bindChoiceIndex`** only (0 .. n−1). Host maps that index to the real
 * `portId` in the same order as {@link bindablePortIds} / bind menu—agents never see opaque ids.
 *
 * For a **terminal** counterparty affordance (`bindChoiceTerminal[i] === true`), the object **omits**
 * `ports`: the new offer cannot extend with further exposes. Non-terminal choices keep optional
 * `ports` (unset or empty) is also allowed on non-terminal choices when the model extends with no new affordances.
 */
export function buildNegotiationTurnOutput(
  bindablePortIds: readonly string[],
  bindChoiceTerminal: readonly boolean[],
  opts: NegotiationTurnSchemaOptions,
): z.ZodType<NegotiationTurnOutput> {
  const n = bindablePortIds.length;
  if (n === 0) {
    throw new RangeError("buildNegotiationTurnOutput: bindablePortIds must be non-empty");
  }
  if (bindChoiceTerminal.length !== n) {
    throw new RangeError(
      "buildNegotiationTurnOutput: bindChoiceTerminal length must match bindablePortIds",
    );
  }

  const portEl = zExposePortEntry(opts);

  const branchForIndex = (i: number): z.ZodType<NegotiationTurnOutput> => {
    const terminal = bindChoiceTerminal[i] === true;
    if (opts.allowAgentPortTtl) {
      const withTtl = {
        bindChoiceIndex: z.literal(i),
        offerType: z.string().min(1).max(600),
        ttl: zTtlSpec.optional(),
        sourcemaps: zOptionalSourcemaps,
      };
      if (terminal) {
        return z.object(withTtl).strict() as z.ZodType<NegotiationTurnOutput>;
      }
      return z
        .object({
          ...withTtl,
          ports: z.array(portEl).optional(),
        })
        .strict() as z.ZodType<NegotiationTurnOutput>;
    }
    const noTtl = {
      bindChoiceIndex: z.literal(i),
      offerType: z.string().min(1).max(600),
      sourcemaps: zOptionalSourcemaps,
    };
    if (terminal) {
      return z.object(noTtl).strict() as z.ZodType<NegotiationTurnOutput>;
    }
    return z
      .object({
        ...noTtl,
        ports: z.array(portEl).optional(),
      })
      .strict() as z.ZodType<NegotiationTurnOutput>;
  };

  const branches = bindablePortIds.map((_, i) => branchForIndex(i));
  if (branches.length === 1) {
    const first = branches.at(0);
    if (first === undefined) {
      throw new RangeError("buildNegotiationTurnOutput: expected one branch");
    }
    return first;
  }
  return z.discriminatedUnion(
    "bindChoiceIndex",
    // zod@4 discriminatedUnion tuple typing is stricter than our homogeneous branch list
    branches as unknown as Parameters<typeof z.discriminatedUnion>[1],
  ) as z.ZodType<NegotiationTurnOutput>;
}

export type NegotiationTurnExposePort = {
  portType: string;
  max_bindings?: number;
  terminal: boolean;
  ref?: string;
  ttl?: TtlSpec;
  sourcemaps?: SourceMapRef[];
};

export type NegotiationTurnOutput = {
  bindChoiceIndex: number;
  offerType: string;
  ttl?: TtlSpec;
  sourcemaps?: SourceMapRef[];
  ports?: NegotiationTurnExposePort[];
};

/**
 * Opening move: extend from empty bind (`bindPortId: ""`) and expose ports only.
 * Used when no counterparty affordances exist yet.
 */
export function buildGenesisNegotiationTurnOutput(
  opts: NegotiationTurnSchemaOptions,
): z.ZodType<NegotiationGenesisTurnOutput> {
  const portEl = zExposePortEntry(opts);
  if (opts.allowAgentPortTtl) {
    return z
      .object({
        offerType: z.string().min(1).max(600),
        ttl: zTtlSpec.optional(),
        sourcemaps: zOptionalSourcemaps,
        ports: z.array(portEl).optional(),
      })
      .strict();
  }
  return z
    .object({
      offerType: z.string().min(1).max(600),
      sourcemaps: zOptionalSourcemaps,
      ports: z.array(portEl).optional(),
    })
    .strict();
}

export type NegotiationGenesisTurnOutput = {
  offerType: string;
  ttl?: TtlSpec;
  sourcemaps?: SourceMapRef[];
  ports?: NegotiationTurnExposePort[];
};
