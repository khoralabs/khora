import type { PortBindPolicy, SourceMapRef } from "@cfd/obp-core";
import { bindPolicyPropertiesToZod, zPortBindPolicy } from "@cfd/obp-core";
import { zOptionalSourcemaps } from "@cfd/obp-tools";
import z from "zod";
import { OBP_NEGOTIATION_BIND_NO_POLICY } from "./constants.ts";
import type { TtlSpec } from "./ttl-spec.ts";
import { zTtlSpec } from "./ttl-spec.ts";

export type NegotiationTurnSchemaOptions = {
  /** When false, structured output must not include `ttl`; host applies defaults only. */
  allowAgentPortTtl: boolean;
  /**
   * When false, each optional `ports[]` entry omits `bind_policy` from the structured-output schema.
   * Bind turns default to omission so JSON Schema stays small for Gemini; genesis keeps full policy DSL.
   */
  exposePortsIncludeBindPolicy?: boolean;
};

const zPortDescription = z.string().min(1).max(4000);

function zExposePortEntry(opts: NegotiationTurnSchemaOptions) {
  const includePolicy = opts.exposePortsIncludeBindPolicy !== false;
  const base = {
    portType: z.string().min(1).max(600),
    description: zPortDescription,
    max_bindings: z.number().int().min(0).max(100).optional(),
    terminal: z.boolean(),
    ref: z.string().max(200).optional(),
    ...(includePolicy ? { bind_policy: zPortBindPolicy.optional() } : {}),
    sourcemaps: zOptionalSourcemaps,
  };
  if (opts.allowAgentPortTtl) {
    return z.object({ ...base, ttl: zTtlSpec.optional() }).strict();
  }
  return z.object(base).strict();
}

function hasBindPolicy(policy: PortBindPolicy | null | undefined): policy is PortBindPolicy {
  return policy !== undefined && policy !== null && policy.properties.length > 0;
}

const FIXED_OUTPUT_KEYS = new Set(["offerType", "ttl", "sourcemaps", "ports"]);

export type NegotiationBindSchemaMenuEntry = {
  portId: string;
  terminal: boolean;
  bind_policy?: PortBindPolicy;
  affordanceDescription: string;
};

/**
 * Bind turn: exactly **one** optional property per bindable port, keyed by **`portId`**.
 * Value is **`"obp:bind"`** (no policy) or the **policy-shaped object** when that port has `bind_policy`.
 * Each key uses Zod `.describe(affordanceDescription)` for structured-output APIs.
 *
 * If the chosen port is **terminal**, `ports` must be absent (`superRefine`).
 */
export function buildNegotiationTurnOutput(
  menu: readonly NegotiationBindSchemaMenuEntry[],
  opts: NegotiationTurnSchemaOptions,
): z.ZodType<NegotiationTurnOutput> {
  if (menu.length === 0) {
    throw new RangeError("buildNegotiationTurnOutput: menu must be non-empty");
  }
  for (const m of menu) {
    if (FIXED_OUTPUT_KEYS.has(m.portId)) {
      throw new RangeError(
        `buildNegotiationTurnOutput: portId collides with fixed output key: ${m.portId}`,
      );
    }
  }

  const portEl = zExposePortEntry({
    ...opts,
    /** Never embed {@link zPortBindPolicy} under `ports[]` on bind turns—see `NegotiationTurnSchemaOptions`. */
    exposePortsIncludeBindPolicy: false,
  });
  const bindShape: Record<string, z.ZodTypeAny> = {};
  for (const m of menu) {
    const pol = hasBindPolicy(m.bind_policy)
      ? bindPolicyPropertiesToZod(m.bind_policy.properties)
      : null;
    bindShape[m.portId] =
      pol !== null
        ? pol.optional().describe(m.affordanceDescription)
        : z.literal(OBP_NEGOTIATION_BIND_NO_POLICY).optional().describe(m.affordanceDescription);
  }

  const baseShape = opts.allowAgentPortTtl
    ? {
        offerType: z.string().min(1).max(600),
        ttl: zTtlSpec.optional(),
        sourcemaps: zOptionalSourcemaps,
        ports: z.array(portEl).optional(),
      }
    : {
        offerType: z.string().min(1).max(600),
        sourcemaps: zOptionalSourcemaps,
        ports: z.array(portEl).optional(),
      };

  return z
    .object({ ...baseShape, ...bindShape })
    .strict()
    .superRefine((data, ctx) => {
      const d = data as Record<string, unknown>;
      let chosen: NegotiationBindSchemaMenuEntry | null = null;

      for (const m of menu) {
        const v = d[m.portId];
        if (v === undefined) {
          continue;
        }
        if (chosen !== null) {
          ctx.addIssue({
            code: "custom",
            message: "Only one counterparty port may be bound: at most one bind key may be set.",
          });
          return;
        }
        const pol = hasBindPolicy(m.bind_policy);
        if (pol) {
          if (v !== null && typeof v === "object" && !Array.isArray(v)) {
            chosen = m;
          } else {
            ctx.addIssue({
              code: "custom",
              message: `Bind key ${m.portId}: expected an object matching the port bind policy.`,
              path: [m.portId],
            });
          }
        } else if (v === OBP_NEGOTIATION_BIND_NO_POLICY) {
          chosen = m;
        } else {
          ctx.addIssue({
            code: "custom",
            message: `Bind key ${m.portId}: expected "${OBP_NEGOTIATION_BIND_NO_POLICY}" when present.`,
            path: [m.portId],
          });
        }
      }

      if (chosen === null) {
        ctx.addIssue({
          code: "custom",
          message: `Exactly one counterparty port must be bound: set exactly one bind key to "${OBP_NEGOTIATION_BIND_NO_POLICY}" or to the policy object.`,
        });
        return;
      }

      if (chosen.terminal && d.ports !== undefined) {
        ctx.addIssue({
          code: "custom",
          message: "When binding a terminal counterparty affordance, omit the `ports` property.",
          path: ["ports"],
        });
      }
    }) as z.ZodType<NegotiationTurnOutput>;
}

export type NegotiationTurnExposePort = {
  portType: string;
  /** Required: counterparty-facing explanation of this affordance. */
  description: string;
  max_bindings?: number;
  terminal: boolean;
  ref?: string;
  bind_policy?: PortBindPolicy;
  ttl?: TtlSpec;
  sourcemaps?: SourceMapRef[];
};

export type NegotiationTurnOutput = {
  offerType: string;
  ttl?: TtlSpec;
  sourcemaps?: SourceMapRef[];
  ports?: NegotiationTurnExposePort[];
} & Record<string, unknown>;

/**
 * Opening move: extend from empty bind (`bindPortId: ""`) and expose ports only.
 * Used when no counterparty affordances exist yet.
 */
export function buildGenesisNegotiationTurnOutput(
  opts: NegotiationTurnSchemaOptions,
): z.ZodType<NegotiationGenesisTurnOutput> {
  const portEl = zExposePortEntry(opts) as z.ZodType<NegotiationTurnExposePort>;
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
