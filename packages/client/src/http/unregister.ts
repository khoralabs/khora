import {
  type KhoraUnregisterRequestBody,
  zKhoraUnregisterRequestBody,
} from "@khoralabs/khora-contracts";
import { KHORA_HTTP_PATH } from "@khoralabs/khora-contracts/http";
import type { KhoraUnaryTransport } from "../transport";

export type UnregisterBody = Omit<KhoraUnregisterRequestBody, "did"> & {
  did?: string;
};

export async function unregister(t: KhoraUnaryTransport, body: UnregisterBody = {}): Promise<void> {
  const finalBody = zKhoraUnregisterRequestBody.parse({
    ...body,
    did: t.did,
  });
  await t.requestVoid("POST", KHORA_HTTP_PATH.unregister, { body: finalBody });
}
