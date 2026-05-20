import { auth } from "./auth.ts";

type SessionUser = {
  id: string;
  email: string;
  name: string;
  role?: string | null;
};

export type AdminSession = {
  user: SessionUser;
  session: { id: string; userId: string; expiresAt: Date };
};

export async function getSession(req: Request): Promise<AdminSession | null> {
  const result = await auth.api.getSession({ headers: req.headers });
  if (result === null) return null;
  return result as AdminSession;
}

export async function requireAdmin(req: Request): Promise<Response | null> {
  const session = await getSession(req);
  if (session === null) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}
