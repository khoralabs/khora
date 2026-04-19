import { tool } from "@cfd/agent-identity";
import type { SourceMapRef } from "@cfd/obp-core";
import z from "zod";
import { DEFAULT_EXPIRY_HOURS, expiresAtFromHours, MAX_EXPIRY_HOURS } from "./obp-tool-defaults.ts";
import type { ObpToolkitEnv } from "./obp-toolkit-env.ts";
import { zOptionalSourcemaps } from "./sourcemaps-schema.ts";

export const zObpExposePortInput = z
  .object({
    offerId: z.string().uuid(),
    portType: z.string().min(1).max(600),
    /** Defaults to 1 (typical single-bind / commitment port). */
    max_bindings: z.number().int().min(0).max(100).optional(),
    terminal: z.boolean(),
    ref: z.string().max(200).optional(),
    /**
     * Port validity window in whole hours from now. Defaults to 24.
     */
    expiresAfterHours: z.number().int().min(1).max(MAX_EXPIRY_HOURS).optional(),
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
    "EXPOSE: attach a port to an offer your party extends. Port id and timestamps are assigned by the system; default expiry is 24 hours and max_bindings defaults to 1 unless you set them.",
  inputSchema: zObpExposePortInput,
  handler: async (ctx, input) => {
    const parsed = zObpExposePortInput.parse(input);
    const env = ctx.env;
    const owner = env.client.getExtendingPartyId(parsed.offerId);
    if (owner !== env.actingPartyId) {
      throw new Error(`obp_expose_port: offer ${parsed.offerId} is not owned by your party`);
    }
    const now = env.now();
    const hours = parsed.expiresAfterHours ?? DEFAULT_EXPIRY_HOURS;
    const sourcemaps: SourceMapRef[] = parsed.sourcemaps ?? [];
    const { port } = env.client.exposePort({
      offerId: parsed.offerId,
      port: {
        id: "",
        ts_created: now,
        ts_expired: expiresAtFromHours(now, hours),
        type: parsed.portType,
        max_bindings: parsed.max_bindings ?? 1,
        terminal: parsed.terminal,
        ref: parsed.ref?.trim() ?? "",
        sourcemaps,
      },
    });
    return { portId: port.id, offerId: parsed.offerId, terminal: port.terminal };
  },
});
