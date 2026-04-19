import { tool } from "@cfd/agent-identity";
import type { SourceMapRef } from "@cfd/obp-core";
import z from "zod";
import { DEFAULT_EXPIRY_HOURS, expiresAtFromHours, MAX_EXPIRY_HOURS } from "./obp-tool-defaults.ts";
import type { ObpToolkitEnv } from "./obp-toolkit-env.ts";
import { zOptionalSourcemaps } from "./sourcemaps-schema.ts";

export const zObpExtendOfferInput = z
  .object({
    offerType: z.string().min(1).max(600),
    /**
     * How long the offer stays valid, in whole hours from now. Defaults to 24.
     * Prefer this over raw millisecond offsets.
     */
    expiresAfterHours: z.number().int().min(1).max(MAX_EXPIRY_HOURS).optional(),
    sourcemaps: zOptionalSourcemaps,
  })
  .strict();

export type ObpExtendOfferInput = z.infer<typeof zObpExtendOfferInput>;

export const obpExtendOfferTool = tool<
  "obp_extend_offer",
  ObpExtendOfferInput,
  { offerId: string; type: string },
  ObpToolkitEnv
>({
  name: "obp_extend_offer",
  description:
    "EXTEND: create an offer from your party. Provide offerType (e.g. demo.negotiation.v1|...). Offer id and timestamps are assigned by the system; default expiry is 24 hours unless you set expiresAfterHours.",
  inputSchema: zObpExtendOfferInput,
  handler: async (ctx, input) => {
    const parsed = zObpExtendOfferInput.parse(input);
    const env = ctx.env;
    const hours = parsed.expiresAfterHours ?? DEFAULT_EXPIRY_HOURS;
    const now = env.now();
    const sourcemaps: SourceMapRef[] = parsed.sourcemaps ?? [];
    const { offer } = env.client.extendOffer({
      partyId: env.actingPartyId,
      bindPortId: "",
      offer: {
        id: "",
        ts_created: now,
        ts_expired: expiresAtFromHours(now, hours),
        type: parsed.offerType,
        sourcemaps,
      },
    });
    return { offerId: offer.id, type: offer.type };
  },
});
