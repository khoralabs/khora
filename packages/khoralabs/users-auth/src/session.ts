import { getRegistryAuth } from "./auth";

type SessionUser = {
  id: string;
  email: string;
  name: string;
  role?: string | null;
};

export type RegistrySession = {
  user: SessionUser;
  session: { id: string; userId: string; expiresAt: Date };
};

export async function getRegistrySession(req: Request): Promise<RegistrySession | null> {
  const result = await getRegistryAuth().api.getSession({ headers: req.headers });
  if (result === null) return null;
  return result as RegistrySession;
}
