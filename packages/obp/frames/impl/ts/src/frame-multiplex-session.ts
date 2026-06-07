import { ObpError } from "@khoralabs/obp-errors";
import type { SessionOp } from "@khoralabs/obp-session-impl";

import { canonicalSessionParties, normalizeSessionInit } from "./frame-init-wire";
import { MultiplexSessionRuntime } from "./frame-multiplex-runtime";
import { defaultSessionEnvelopeSyncAdapter } from "./frame-multiplex-session-envelope-default";
import { ensureSignerInSession } from "./frame-multiplex-session-helpers";
import type { RunFrameMultiplexSessionArgs } from "./frame-multiplex-session-types";
import type { SessionInitNormalized } from "./frame-protocol-types";

export type {
  RunFrameMultiplexSessionArgs,
  SessionEnvelopeSyncAdapter,
} from "./frame-multiplex-session-types";

export { defaultSessionEnvelopeSyncAdapter };

function validateRunFrameMultiplexSessionArgs(args: RunFrameMultiplexSessionArgs): void {
  const userOpener = args.openerSession;
  const plans = (args.initiatorChainPlans ?? []).map((p) => ({
    init: normalizeSessionInit(p.init),
  }));
  if (userOpener !== undefined && plans.length > 0) {
    throw new ObpError("VALIDATION", "openerSession cannot be combined with initiatorChainPlans");
  }

  const usesSequentialPlans = plans.length > 0;
  const lazyTemplate: Pick<SessionInitNormalized, "parties"> | undefined =
    args.sessionTemplate !== undefined
      ? {
          parties: canonicalSessionParties([
            args.sessionTemplate.parties[0],
            args.sessionTemplate.parties[1],
          ]),
        }
      : undefined;

  if (userOpener === undefined && lazyTemplate === undefined) {
    throw new ObpError(
      "VALIDATION",
      "sessionTemplate is required unless openerSession defers it via first init",
    );
  }

  const signer = args.signer;

  if (userOpener === undefined && lazyTemplate !== undefined) {
    const templateInit: SessionInitNormalized = {
      session_id: "__template__",
      parties: lazyTemplate.parties,
      genesis_hash: "__template_genesis__",
    };
    if (usesSequentialPlans) {
      const p0 = plans[0];
      if (p0 === undefined) {
        throw new ObpError(
          "VALIDATION",
          "initiatorChainPlans must be non-empty when opening chains",
        );
      }
      ensureSignerInSession(p0.init, signer);
    } else {
      ensureSignerInSession(templateInit, signer);
    }
  }

  const sessionEnvelopeSync = args.sessionEnvelopeSync;
  if (sessionEnvelopeSync !== undefined) {
    const hasPartyId =
      (sessionEnvelopeSync.myPartyId !== undefined && sessionEnvelopeSync.myPartyId !== "") ||
      sessionEnvelopeSync.getMyPartyId !== undefined;
    if (!hasPartyId) {
      throw new ObpError("VALIDATION", "sessionEnvelopeSync requires myPartyId or getMyPartyId");
    }
  }
}

/** Run multiple {@link SessionInitNormalized} chains on one {@link DuplexByteStream}; route frames by `p_hash` → registered tip / genesis. */
export async function runFrameMultiplexSession(
  args: RunFrameMultiplexSessionArgs,
): Promise<SessionOp[]> {
  validateRunFrameMultiplexSessionArgs(args);
  return new MultiplexSessionRuntime(args).run();
}
