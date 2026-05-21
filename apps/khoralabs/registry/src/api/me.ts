import {
  countMembershipsForAccount,
  findAccountByAuthSubject,
  listAccessTokenRequestsForAccount,
  listMarketingConsentsForAccount,
} from "@khoralabs/users";
import { getRegistryDatabase, getRegistrySession } from "@khoralabs/users-auth";

export async function handleMe(req: Request): Promise<Response> {
  const session = await getRegistrySession(req);
  if (session === null) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getRegistryDatabase();
  const account = findAccountByAuthSubject(db, session.user.id);
  const accessRequests = account === null ? [] : listAccessTokenRequestsForAccount(db, account.id);
  const marketingConsents = account === null ? [] : listMarketingConsentsForAccount(db, account.id);
  const membershipsCount = account === null ? 0 : countMembershipsForAccount(db, account.id);

  return Response.json({
    user: session.user,
    session: {
      id: session.session.id,
      expiresAt: session.session.expiresAt,
    },
    account,
    accessRequests,
    marketingConsents,
    memberships: { count: membershipsCount, items: [] },
  });
}
