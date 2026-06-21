import { requireRegistrySessionResponse } from "../auth/require-session";
import { getDb } from "../db/index";
import { acceptUserTerms, getOrCreateUserForAuth } from "../identity/users";

export async function handleAcceptTerms(req: Request): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  const db = getDb();
  const user = await getOrCreateUserForAuth(db, req, auth.session);
  const termsAcceptedAtMs = acceptUserTerms(db, user.id);
  return Response.json({ ok: true, termsAcceptedAtMs });
}
