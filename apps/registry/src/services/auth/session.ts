import type { RegistrySession } from "@khoralabs/registry/host";
import { getRegistryAuth } from "./instance";

export type { RegistrySession };

export async function getRegistrySession(req: Request): Promise<RegistrySession | null> {
  const result = await getRegistryAuth().api.getSession({ headers: req.headers });
  if (result === null) return null;
  return {
    user: { id: result.user.id, email: result.user.email ?? null },
    session: { id: result.session.id, expiresAt: result.session.expiresAt },
  };
}
