import {
  AuthStrategyError,
  createDidKeyEd25519Strategy,
  parseAgentRequestEnvelopeFromHeaders,
} from "@khoralabs/khora-auth";
import {
  clearBindingIfNoHostLinks,
  consumeCliLinkChallenge,
  createCliLinkChallenge,
  ensureAgentLinkedOnHost,
  findAccountByAuthSubject,
  findBindingByAgentDid,
  findMembershipByAccountAndHost,
  linkAgentToAccountOnHost,
  listAgentLinksForAccount,
  propagateAgentLinksToHosts,
  unlinkAgentFromMembership,
} from "@khoralabs/khora-registry/accounts";
import { findActiveHostBySlug, findHostById } from "@khoralabs/khora-registry/catalog";
import type { RegistryDatabase } from "@khoralabs/khora-registry/persistence";
import { registryHostRuntime } from "../runtime";
import { HOST_NOT_FOUND_HINT, resolveRegistryHost } from "./resolve-host";

const linkStrategy = createDidKeyEd25519Strategy();

async function verifyAgentLinkSignature(
  req: Request,
  bodyText: string,
  claimedDid: string,
  path: string,
): Promise<void> {
  const envelope = parseAgentRequestEnvelopeFromHeaders(req.headers);
  if (envelope === undefined) {
    throw new Error("missing agent signature headers");
  }
  if (envelope.did !== claimedDid) {
    throw new Error("signature DID does not match challenge");
  }
  await linkStrategy.verifyEnvelope({
    envelope,
    method: "POST",
    path,
    bodyText,
  });
}

type LinkAgentBody = {
  challengeId?: string;
  hostBaseUrl?: string;
  hostSlug?: string;
  agentDid?: string;
  propagateHostSlugs?: string[];
};

async function resolvePropagateHostIds(
  db: RegistryDatabase,
  slugs: string[],
  excludeHostId: string,
): Promise<string[]> {
  const ids: string[] = [];
  for (const slug of slugs) {
    const trimmed = slug.trim();
    if (trimmed.length === 0) continue;
    const host = await findActiveHostBySlug(db, trimmed);
    if (host !== null && host.id !== excludeHostId) {
      ids.push(host.id);
    }
  }
  return ids;
}

async function formatPropagated(
  db: RegistryDatabase,
  raw: Awaited<ReturnType<typeof propagateAgentLinksToHosts>>,
): Promise<{ hostSlug: string | null; ok: boolean; error?: string }[]> {
  return Promise.all(
    raw.map(async (r) => {
      const host = await findHostById(db, r.hostId);
      return {
        hostSlug: host?.slug ?? null,
        ok: r.ok,
        ...(r.error !== undefined ? { error: r.error } : {}),
      };
    }),
  );
}

export async function handleLinkChallenge(_req: Request, url: URL): Promise<Response> {
  const did = url.searchParams.get("did")?.trim() ?? "";
  if (did.length === 0) {
    return Response.json({ error: "did query required" }, { status: 400 });
  }

  const db = registryHostRuntime().db;
  const challenge = await createCliLinkChallenge(db, did);
  return Response.json({
    challengeId: challenge.id,
    expiresAtMs: challenge.expiresAtMs,
  });
}

export async function handleLinkAgent(req: Request): Promise<Response> {
  const session = await registryHostRuntime().identity.getSession(req);
  if (session === null) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bodyText = await req.text();
  let body: LinkAgentBody;
  try {
    body = JSON.parse(bodyText) as LinkAgentBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const challengeId = body.challengeId?.trim() ?? "";
  if (challengeId.length === 0) {
    return Response.json({ error: "challengeId required" }, { status: 400 });
  }

  const db = registryHostRuntime().db;
  const account = await findAccountByAuthSubject(db, session.user.id);
  if (account === null) {
    return Response.json({ error: "Account not found" }, { status: 404 });
  }
  if (account.status !== "active") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const envelope = parseAgentRequestEnvelopeFromHeaders(req.headers);
  if (envelope === undefined) {
    return Response.json({ error: "missing agent signature" }, { status: 401 });
  }
  const envelopeDid = envelope.did;

  try {
    await consumeCliLinkChallenge(db, { challengeId, agentDid: envelopeDid });
    await verifyAgentLinkSignature(req, bodyText, envelopeDid, "/v1/link/agent");
  } catch (err: unknown) {
    if (err instanceof AuthStrategyError) {
      return Response.json({ error: err.message }, { status: 401 });
    }
    const msg = err instanceof Error ? err.message : "link failed";
    const status = msg.includes("signature") || msg.includes("challenge") ? 401 : 400;
    return Response.json({ error: msg }, { status });
  }

  const host = await resolveRegistryHost(db, {
    hostBaseUrl: body.hostBaseUrl,
    hostSlug: body.hostSlug,
  });
  if (host === null) {
    return Response.json({ error: HOST_NOT_FOUND_HINT }, { status: 404 });
  }

  try {
    const link = await linkAgentToAccountOnHost(db, {
      accountId: account.id,
      agentDid: envelopeDid,
      hostId: host.id,
      boundViaHostId: host.id,
    });

    const propagateIds = await resolvePropagateHostIds(db, body.propagateHostSlugs ?? [], host.id);
    const propagated =
      propagateIds.length > 0
        ? await formatPropagated(
            db,
            await propagateAgentLinksToHosts(db, {
              accountId: account.id,
              agentDid: envelopeDid,
              hostIds: propagateIds,
            }),
          )
        : [];

    return Response.json({
      ok: true,
      link: {
        id: link.id,
        agentDid: link.agentDid,
        hostId: host.id,
        hostSlug: host.slug,
        hostBaseUrl: host.baseUrl,
        membershipId: link.membershipId,
        linkedAtMs: link.linkedAtMs,
      },
      propagated,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "link failed";
    const status = msg.includes("another account") || msg.includes("already bound") ? 409 : 400;
    return Response.json({ error: msg }, { status });
  }
}

export async function handleLinkAgentEnsure(req: Request): Promise<Response> {
  const bodyText = await req.text();
  let body: LinkAgentBody;
  try {
    body = JSON.parse(bodyText) as LinkAgentBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const envelope = parseAgentRequestEnvelopeFromHeaders(req.headers);
  if (envelope === undefined) {
    return Response.json({ error: "missing agent signature" }, { status: 401 });
  }
  const envelopeDid = envelope.did;

  try {
    await verifyAgentLinkSignature(req, bodyText, envelopeDid, "/v1/link/agent/ensure");
  } catch (err: unknown) {
    if (err instanceof AuthStrategyError) {
      return Response.json({ error: err.message }, { status: 401 });
    }
    const msg = err instanceof Error ? err.message : "ensure failed";
    return Response.json({ error: msg }, { status: 401 });
  }

  const db = registryHostRuntime().db;
  const host = await resolveRegistryHost(db, {
    hostBaseUrl: body.hostBaseUrl,
    hostSlug: body.hostSlug,
  });
  if (host === null) {
    return Response.json({ error: HOST_NOT_FOUND_HINT }, { status: 404 });
  }

  const binding = await findBindingByAgentDid(db, envelopeDid);
  if (binding === null) {
    return Response.json(
      { error: "no agent account binding; run khora link first" },
      { status: 404 },
    );
  }

  try {
    const link = await ensureAgentLinkedOnHost(db, {
      accountId: binding.accountId,
      agentDid: envelopeDid,
      hostId: host.id,
    });
    return Response.json({
      ok: true,
      link: {
        id: link.id,
        agentDid: link.agentDid,
        hostId: host.id,
        hostSlug: host.slug,
        hostBaseUrl: host.baseUrl,
        membershipId: link.membershipId,
        linkedAtMs: link.linkedAtMs,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "ensure failed";
    const status = msg.includes("another account") ? 409 : 400;
    return Response.json({ error: msg }, { status });
  }
}

export async function handleLinkStatus(req: Request): Promise<Response> {
  const session = await registryHostRuntime().identity.getSession(req);
  if (session === null) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = registryHostRuntime().db;
  const account = await findAccountByAuthSubject(db, session.user.id);
  if (account === null) {
    return Response.json({ links: [] });
  }
  if (account.status !== "active") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const agentLinks = await listAgentLinksForAccount(db, account.id);
  const links = await Promise.all(
    agentLinks.map(async (link) => {
      const host = await findHostById(db, link.hostId);
      return {
        linkId: link.id,
        membershipId: link.membershipId,
        agentDid: link.agentDid,
        hostId: link.hostId,
        hostSlug: host?.slug ?? null,
        hostBaseUrl: host?.baseUrl ?? null,
        linkedAtMs: link.linkedAtMs,
      };
    }),
  );

  return Response.json({ links });
}

export async function handleLinkUnlink(req: Request): Promise<Response> {
  const session = await registryHostRuntime().identity.getSession(req);
  if (session === null) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bodyText = await req.text();
  let body: LinkAgentBody = {};
  if (bodyText.length > 0) {
    try {
      body = JSON.parse(bodyText) as LinkAgentBody;
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }
  }

  const db = registryHostRuntime().db;
  const account = await findAccountByAuthSubject(db, session.user.id);
  if (account === null) {
    return Response.json({ error: "Account not found" }, { status: 404 });
  }
  if (account.status !== "active") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const host = await resolveRegistryHost(db, {
    hostBaseUrl: body.hostBaseUrl,
    hostSlug: body.hostSlug,
  });
  if (host === null) {
    return Response.json({ error: "host not found" }, { status: 404 });
  }

  const membership = await findMembershipByAccountAndHost(db, account.id, host.id);
  if (membership === null) {
    return Response.json({ ok: true, unlinked: false });
  }

  const envelope = parseAgentRequestEnvelopeFromHeaders(req.headers);
  const agentDid = body.agentDid?.trim() || envelope?.did;
  if (agentDid === undefined || agentDid.length === 0) {
    return Response.json(
      { error: "agentDid required (body or signature headers)" },
      { status: 400 },
    );
  }

  const unlinked = await unlinkAgentFromMembership(db, membership.id, agentDid);
  if (unlinked) {
    await clearBindingIfNoHostLinks(db, agentDid);
  }
  return Response.json({ ok: true, unlinked });
}
