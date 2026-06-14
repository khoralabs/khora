import { verifyRegistrySession } from "@khoralabs/registry-auth";

import { getRegistryUrl } from "../registry-url";

export async function requireRegistrySession(req: Request) {
  return verifyRegistrySession(req, { registryUrl: getRegistryUrl() });
}

export async function requireRegistrySessionResponse(req: Request) {
  const session = await requireRegistrySession(req);
  if (session === null) {
    return { session: null, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { session, response: null };
}
