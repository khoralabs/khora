import {
  AuthStrategyError,
  createDidKeyEd25519Strategy,
  parseAgentRequestEnvelopeFromHeaders,
} from "@khoralabs/khora-auth";
import {
  clearMembershipAgentDid,
  consumeCliLinkChallenge,
  createCliLinkChallenge,
  findAccountByAuthSubject,
  findHostById,
  findMembershipByAccountAndHost,
  listMembershipsForAccount,
  setMembershipAgentDid,
  upsertMembership,
} from "@khoralabs/users";
import { getRegistryDatabase, getRegistrySession } from "@khoralabs/users-auth";
import { HOST_NOT_FOUND_HINT, resolveRegistryHost } from "./resolve-host.ts";

const linkStrategy = createDidKeyEd25519Strategy();

async function verifyLinkAgentSignature(
  req: Request,
  bodyText: string,
  claimedDid: string,
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
    path: "/v1/link/agent",
    bodyText,
  });
}

type LinkAgentBody = {
  challengeId?: string;
  hostBaseUrl?: string;
  hostSlug?: string;
};

export async function handleLinkChallenge(_req: Request, url: URL): Promise<Response> {
  const did = url.searchParams.get("did")?.trim() ?? "";
  if (did.length === 0) {
    return Response.json({ error: "did query required" }, { status: 400 });
  }

  const db = getRegistryDatabase();
  const challenge = createCliLinkChallenge(db, did);
  return Response.json({
    challengeId: challenge.id,
    expiresAtMs: challenge.expiresAtMs,
  });
}

export async function handleLinkAgent(req: Request): Promise<Response> {
  const session = await getRegistrySession(req);
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

  const db = getRegistryDatabase();
  const account = findAccountByAuthSubject(db, session.user.id);
  if (account === null) {
    return Response.json({ error: "Account not found" }, { status: 404 });
  }

  const envelope = parseAgentRequestEnvelopeFromHeaders(req.headers);
  if (envelope === undefined) {
    return Response.json({ error: "missing agent signature" }, { status: 401 });
  }
  const envelopeDid = envelope.did;

  try {
    consumeCliLinkChallenge(db, { challengeId, agentDid: envelopeDid });
    await verifyLinkAgentSignature(req, bodyText, envelopeDid);
  } catch (err: unknown) {
    if (err instanceof AuthStrategyError) {
      return Response.json({ error: err.message }, { status: 401 });
    }
    const msg = err instanceof Error ? err.message : "link failed";
    const status = msg.includes("signature") || msg.includes("challenge") ? 401 : 400;
    return Response.json({ error: msg }, { status });
  }

  const host = resolveRegistryHost(db, {
    hostBaseUrl: body.hostBaseUrl,
    hostSlug: body.hostSlug,
  });
  if (host === null) {
    return Response.json({ error: HOST_NOT_FOUND_HINT }, { status: 404 });
  }

  try {
    const membership = upsertMembership(db, { accountId: account.id, hostId: host.id });
    const updated = setMembershipAgentDid(db, membership.id, envelopeDid);
    return Response.json({
      ok: true,
      membership: {
        id: updated.id,
        hostId: host.id,
        hostSlug: host.slug,
        hostBaseUrl: host.baseUrl,
        agentDid: updated.agentDid,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "link failed";
    return Response.json({ error: msg }, { status: 409 });
  }
}

export async function handleLinkStatus(req: Request): Promise<Response> {
  const session = await getRegistrySession(req);
  if (session === null) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getRegistryDatabase();
  const account = findAccountByAuthSubject(db, session.user.id);
  if (account === null) {
    return Response.json({ links: [] });
  }

  const memberships = listMembershipsForAccount(db, account.id);
  const links = memberships
    .filter((m) => m.agentDid !== null)
    .map((m) => {
      const host = findHostById(db, m.hostId);
      return {
        membershipId: m.id,
        agentDid: m.agentDid,
        hostId: m.hostId,
        hostSlug: host?.slug ?? null,
        hostBaseUrl: host?.baseUrl ?? null,
        status: m.status,
      };
    });

  return Response.json({ links });
}

export async function handleLinkUnlink(req: Request): Promise<Response> {
  const session = await getRegistrySession(req);
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

  const db = getRegistryDatabase();
  const account = findAccountByAuthSubject(db, session.user.id);
  if (account === null) {
    return Response.json({ error: "Account not found" }, { status: 404 });
  }

  const host = resolveRegistryHost(db, {
    hostBaseUrl: body.hostBaseUrl,
    hostSlug: body.hostSlug,
  });
  if (host === null) {
    return Response.json({ error: "host not found" }, { status: 404 });
  }

  const membership = findMembershipByAccountAndHost(db, account.id, host.id);
  if (membership === null) {
    return Response.json({ ok: true, unlinked: false });
  }

  clearMembershipAgentDid(db, membership.id);
  return Response.json({ ok: true, unlinked: true });
}
