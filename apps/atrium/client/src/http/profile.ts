import {
  type AtriumProfile,
  type AtriumProfilePatch,
  zAtriumProfile,
} from "@khoralabs/atrium-contracts";
import type { HttpTransport } from "./transport.ts";

export function updateProfile(t: HttpTransport, patch: AtriumProfilePatch): Promise<AtriumProfile> {
  return t.requestJson("PATCH", "/v1/profile", { body: patch, parse: zAtriumProfile });
}
