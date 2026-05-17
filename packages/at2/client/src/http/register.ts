import {
  type AtriumRegistrationRequestBody,
  type AtriumRegistrationResult,
  zAtriumRegisterResult,
  zAtriumRegistrationRequestBody,
} from "@khoralabs/at2-contracts";
import type { At2UnaryTransport } from "@khoralabs/at2-transport";

export type RegisterBody = Omit<AtriumRegistrationRequestBody, "did"> & { did?: string };

export async function register(
  t: At2UnaryTransport,
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
