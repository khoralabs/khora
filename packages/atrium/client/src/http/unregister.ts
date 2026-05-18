import { type AtriumUnregisterRequestBody, zAtriumUnregisterRequestBody } from "@khoralabs/at2-contracts";
import type { At2UnaryTransport } from "@khoralabs/at2-transport";

export type UnregisterBody = Omit<AtriumUnregisterRequestBody, "did"> & { did?: string };

export async function unregister(t: At2UnaryTransport, body: UnregisterBody = {}): Promise<void> {
  const finalBody = zAtriumUnregisterRequestBody.parse({
    ...body,
    did: t.did,
  });
  await t.requestVoid("POST", "/v1/unregister", { body: finalBody });
}
