import {
  type KhoraRegistrationRequestBody,
  type KhoraRegistrationResult,
  zKhoraRegisterResult,
  zKhoraRegistrationRequestBody,
} from "@khoralabs/khora-contracts";
import type { KhoraUnaryTransport } from "@khoralabs/khora-transport";

export type RegisterBody = Omit<KhoraRegistrationRequestBody, "did"> & {
  did?: string;
};

export async function register(
  t: KhoraUnaryTransport,
  body: RegisterBody = {},
): Promise<{ result: KhoraRegistrationResult; requestDid: string }> {
  const finalBody: KhoraRegistrationRequestBody = zKhoraRegistrationRequestBody.parse({
    ...body,
    did: t.did,
  });
  const result = await t.requestJson("POST", "/v1/register", {
    body: finalBody,
    parse: zKhoraRegisterResult,
  });
  return { result, requestDid: finalBody.did };
}
