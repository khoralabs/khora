import { ObpError } from "@khoralabs/obp-core";
import { parsePriceFromType } from "./encoding.ts";
import type { ObpToolkitEnv } from "./obp-toolkit-env.ts";

/**
 * Shared bind path for dynamic bind tools and legacy {@link obp_bind_port}.
 * Does not require `port.terminal` (OBP: terminal is a hint only).
 */
export async function executeObpBind(
  env: ObpToolkitEnv,
  input: { offerId: string; portId: string },
): Promise<{ offerId: string; portId: string; price: number | null }> {
  const offerOwnerPartyId = env.client.getExtendingPartyId(input.offerId);
  const portRes = env.client.getPort(input.portId);
  if (portRes.kind === "notFound") {
    throw new Error("obp_bind: port not found");
  }
  const port = portRes.port;
  const price = parsePriceFromType(port.type);
  if (env.validateBind) {
    await env.validateBind({
      actingPartyId: env.actingPartyId,
      offerId: input.offerId,
      portId: input.portId,
      offerOwnerPartyId,
      port,
      price,
    });
  }
  try {
    env.client.bindPort({ offerId: input.offerId, portId: input.portId });
  } catch (e) {
    if (e instanceof ObpError) {
      throw new Error(`${e.code}: ${e.message}`);
    }
    throw e;
  }
  return { offerId: input.offerId, portId: input.portId, price };
}
