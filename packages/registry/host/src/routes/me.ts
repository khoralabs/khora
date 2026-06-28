import {
  countMembershipsForAccount,
  findAccountByAuthSubject,
  listAccountEmails,
  listAgentLinksForMembership,
  listMarketingConsentsForAccount,
  listMembershipsForAccount,
} from "@khoralabs/registry-accounts";
import { findHostById } from "@khoralabs/registry-catalog";
import { registryHostRuntime } from "../runtime";

export async function handleMe(req: Request): Promise<Response> {
  const session = await registryHostRuntime().identity.getSession(req);
  if (session === null) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = registryHostRuntime().db;
  const account = await findAccountByAuthSubject(db, session.user.id);
  const marketingConsents =
    account === null ? [] : await listMarketingConsentsForAccount(db, account.id);
  const membershipsCount = account === null ? 0 : await countMembershipsForAccount(db, account.id);
  const membershipRows = account === null ? [] : await listMembershipsForAccount(db, account.id);
  const membershipItems = await Promise.all(
    membershipRows.map(async (m) => {
      const host = await findHostById(db, m.hostId);
      const links = await listAgentLinksForMembership(db, m.id);
      const linkedAgents = links.map((link) => ({
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
    }),
  );

  return Response.json({
    user: { id: session.user.id },
    emails: account === null ? [] : await listAccountEmails(db, account.id),
    session: {
      id: session.session.id,
      expiresAt: session.session.expiresAt,
    },
    account,
    marketingConsents,
    memberships: { count: membershipsCount, items: membershipItems },
  });
}
