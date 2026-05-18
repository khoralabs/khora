import {
  type AtriumUnregisterRequestBody,
  zAtriumUnregisterRequestBody,
} from "@khoralabs/atrium-contracts";
import type { AtriumUnaryTransport } from "@khoralabs/atrium-transport";

export type UnregisterBody = Omit<AtriumUnregisterRequestBody, "did"> & {
  did?: string;
};

export async function unregister(
  t: AtriumUnaryTransport,
  body: UnregisterBody = {},
): Promise<void> {
  const finalBody = zAtriumUnregisterRequestBody.parse({
    ...body,
    did: t.did,
  });
  await t.requestVoid("POST", "/v1/unregister", { body: finalBody });
}
