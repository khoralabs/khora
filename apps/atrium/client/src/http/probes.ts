import { type AtriumPost, zAtriumPost } from "@khoralabs/atrium-contracts";
import z from "zod";
import type { HttpTransport } from "./transport.ts";

const zProbesList = z.object({
  probes: z.array(zAtriumPost),
});

export async function listProbes(
  t: HttpTransport,
  params: { active?: boolean } = {},
): Promise<AtriumPost[]> {
  const path = params.active === true ? "/v1/probes?active=1" : "/v1/probes";
  const out = await t.requestJson("GET", path, { parse: zProbesList });
  return out.probes;
}
