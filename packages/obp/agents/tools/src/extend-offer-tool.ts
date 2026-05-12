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

export const zObpExtendOfferInput = z
  .object({
    offerType: z.string().min(1).max(600),
    /**
     * Relative **`expires_seq`**: current ledger sequence plus this delta.
     * Omit for host default ({@link DEFAULT_EXPIRY_SEQ_DELTA}).
     */
    expires_after_seq: z.number().int().min(1).max(MAX_EXPIRY_SEQ_DELTA).optional(),
    /** Absolute **`expires_seq`** when set overrides **`expires_after_seq`**. */
    expires_seq: z.number().int().min(1).optional(),
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
    "EXTEND: create an offer from your party. Provide offerType (e.g. demo.negotiation.v1|...). Offer id and ledger sequence fields are assigned by the system; default validity uses a large relative ledger delta unless you set expires_seq / expires_after_seq.",
  inputSchema: zObpExtendOfferInput,
  handler: async (ctx, input) => {
    const parsed = zObpExtendOfferInput.parse(input);
    const env = ctx.env;
    const at = env.ledgerSeq();
    const expiresSeq =
      parsed.expires_seq ??
      expiresSeqAfterDelta(at, parsed.expires_after_seq ?? DEFAULT_EXPIRY_SEQ_DELTA);
    const sourcemaps: SourceMapRef[] = parsed.sourcemaps ?? [];
    const { offer } = env.client.extendOffer({
      partyId: env.actingPartyId,
      bindPortId: "",
      offer: {
        id: "",
        created_seq: at,
        expires_seq: expiresSeq,
        type: parsed.offerType,
        sourcemaps,
      },
    });
    return { offerId: offer.id, type: offer.type };
  },
});
