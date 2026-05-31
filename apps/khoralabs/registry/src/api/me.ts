import {
  countMembershipsForAccount,
  findAccountByAuthSubject,
  findHostById,
  listAgentLinksForMembership,
  listMarketingConsentsForAccount,
  listMembershipsForAccount,
} from "@khoralabs/users";
import { getRegistryDatabase, getRegistrySession } from "@khoralabs/users-auth";

export async function handleMe(req: Request): Promise<Response> {
  const session = await getRegistrySession(req);
  if (session === null) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getRegistryDatabase();
  const account = findAccountByAuthSubject(db, session.user.id);
  const marketingConsents = account === null ? [] : listMarketingConsentsForAccount(db, account.id);
  const membershipsCount = account === null ? 0 : countMembershipsForAccount(db, account.id);
  const membershipRows = account === null ? [] : listMembershipsForAccount(db, account.id);
  const membershipItems = membershipRows.map((m) => {
    const host = findHostById(db, m.hostId);
    const linkedAgents = listAgentLinksForMembership(db, m.id).map((link) => ({
      agentDid: link.agentDid,
      linkedAtMs: link.linkedAtMs,
    }));
    return {
      id: m.id,
      hostId: m.hostId,
      hostSlug: host?.slug ?? null,
      hostBaseUrl: host?.baseUrl ?? null,
      linkedAgents,
    };
  });

  return Response.json({
    user: session.user,
    session: {
      id: session.session.id,
      expiresAt: session.session.expiresAt,
    },
    account,
    marketingConsents,
    memberships: { count: membershipsCount, items: membershipItems },
  });
}
