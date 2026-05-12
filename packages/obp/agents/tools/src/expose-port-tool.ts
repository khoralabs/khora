import { tool } from "@khoralabs/agent-identity";
import type { SourceMapRef } from "@khoralabs/obp-core";
import z from "zod";
import {
  DEFAULT_EXPIRY_SEQ_DELTA,
  expiresSeqAfterDelta,
  MAX_EXPIRY_SEQ_DELTA,
} from "./obp-tool-defaults.ts";
import type { ObpToolkitEnv } from "./obp-toolkit-env.ts";
import { zOptionalSourcemaps } from "./sourcemaps-schema.ts";

export const zObpExposePortInput = z
  .object({
    offerId: z.uuid(),
    portType: z.string().min(1).max(600),
    /** Counterparty-facing affordance copy (required). */
    promise: z.string().min(1).max(2000),
    /** Defaults to 1 (typical single-bind / commitment port). */
    max_bindings: z.number().int().min(0).max(100).optional(),
    terminal: z.boolean(),
    ref: z.string().max(200).optional(),
    /**
     * Relative **`expires_seq`**: current ledger sequence plus this delta (minimum 1).
     * Omit for host default ({@link DEFAULT_EXPIRY_SEQ_DELTA}).
     */
    expires_after_seq: z.number().int().min(1).max(MAX_EXPIRY_SEQ_DELTA).optional(),
    /**
     * Absolute **`expires_seq`** (exclusive bind upper bound). When set, overrides **`expires_after_seq`**.
     */
    expires_seq: z.number().int().min(1).optional(),
    sourcemaps: zOptionalSourcemaps,
  })
  .strict();

export type ObpExposePortInput = z.infer<typeof zObpExposePortInput>;

export const obpExposePortTool = tool<
  "obp_expose_port",
  ObpExposePortInput,
  { portId: string; offerId: string; terminal: boolean },
  ObpToolkitEnv
>({
  name: "obp_expose_port",
  description:
    "EXPOSE: attach a port to an offer your party extends. Port id and ledger sequence fields are assigned by the system; default validity window is a large relative ledger delta unless you set expires_seq / expires_after_seq.",
  inputSchema: zObpExposePortInput,
  handler: async (ctx, input) => {
    const parsed = zObpExposePortInput.parse(input);
    const env = ctx.env;
    const owner = env.client.getExtendingPartyId(parsed.offerId);
    if (owner !== env.actingPartyId) {
      throw new Error(`obp_expose_port: offer ${parsed.offerId} is not owned by your party`);
    }
    const at = env.ledgerSeq();
    const expiresSeq =
      parsed.expires_seq ??
      expiresSeqAfterDelta(at, parsed.expires_after_seq ?? DEFAULT_EXPIRY_SEQ_DELTA);
    const sourcemaps: SourceMapRef[] = parsed.sourcemaps ?? [];
    const { port } = env.client.exposePort({
      offerId: parsed.offerId,
      port: {
        id: "",
        created_seq: at,
        expires_seq: expiresSeq,
        type: parsed.portType,
        promise: parsed.promise.trim(),
        max_bindings: parsed.max_bindings ?? 1,
        terminal: parsed.terminal,
        ref: parsed.ref?.trim() ?? "",
        sourcemaps,
      },
    });
    return { portId: port.id, offerId: parsed.offerId, terminal: port.terminal };
  },
});
