import { verifyRegistrySession } from "@khoralabs/registry-auth";

import { getRegistryUrl } from "../registry-url";

export async function handleGetSession(req: Request): Promise<Response> {
  const session = await verifyRegistrySession(req, { registryUrl: getRegistryUrl() });
  if (session === null) {
    return Response.json({ authenticated: false }, { status: 401 });
  }

  return Response.json({
    authenticated: true,
    user: session.user,
    session: {
      id: session.session.id,
      expiresAt: session.session.expiresAt,
    },
  });
}
