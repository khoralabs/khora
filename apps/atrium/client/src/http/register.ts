import {
  type AtriumRegistrationRequestBody,
  type AtriumRegistrationResult,
  zAtriumRegisterResult,
  zAtriumRegistrationRequestBody,
} from "@khoralabs/atrium-contracts";
import type { AtriumUnaryTransport } from "@khoralabs/atrium-transport";

export type RegisterBody = Omit<AtriumRegistrationRequestBody, "did"> & { did?: string };

export async function register(
  t: AtriumUnaryTransport,
  body: RegisterBody = {},
): Promise<{ result: AtriumRegistrationResult; requestDid: string }> {
  const finalBody: AtriumRegistrationRequestBody = zAtriumRegistrationRequestBody.parse({
    ...body,
    did: t.did,
  });
  const result = await t.requestJson("POST", "/v1/register", {
    body: finalBody,
    parse: zAtriumRegisterResult,
  });
  return { result, requestDid: finalBody.did };
}
