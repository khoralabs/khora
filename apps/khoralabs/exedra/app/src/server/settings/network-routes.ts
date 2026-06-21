import { getRegistrySessionCookieHeader } from "@khoralabs/registry-auth";

import { requireRegistrySessionResponse } from "../auth/require-session";
import { hasOrgAdminGrant } from "../authz/policy";
import { getDb } from "../db/index";
import { getOrg } from "../db/membership";
import {
  registerOrgDidOnNetwork,
  registerUserDidOnNetwork,
} from "../identity/network-registration";
import { getOrgIdentityEncrypted, setOrgNetworkOptedIn } from "../identity/orgs";
import {
  getOrCreateUserForAuth,
  getUserIdentityEncrypted,
  setUserMarketingOptedIn,
  setUserNetworkOptedIn,
} from "../identity/users";
import { logger } from "../logger";
import { getRegistryUrl } from "../registry-url";

const MARKETING_LIST_SLUG = "khoralabs-updates";

export async function handleJoinNetwork(req: Request): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  const db = getDb();
  const user = await getOrCreateUserForAuth(db, req, auth.session);
  if (user.networkOptedInAtMs !== null) {
    return Response.json({ ok: true, networkOptedInAtMs: user.networkOptedInAtMs });
  }

  const identityEncrypted = getUserIdentityEncrypted(db, user.id);
  if (identityEncrypted === null) {
    return Response.json({ error: "User identity not found" }, { status: 500 });
  }

  await registerUserDidOnNetwork({
    identityEncrypted,
    email: user.email,
    registrySessionCookie: getRegistrySessionCookieHeader(req),
  });

  const networkOptedInAtMs = setUserNetworkOptedIn(db, user.id);
  return Response.json({ ok: true, networkOptedInAtMs });
}

export async function handleJoinOrgNetwork(req: Request, orgId: string): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  const db = getDb();
  const user = await getOrCreateUserForAuth(db, req, auth.session);
  const org = getOrg(db, orgId);
  if (org === null) {
    return Response.json({ error: "Organization not found" }, { status: 404 });
  }
  if (!hasOrgAdminGrant(db, user.id, orgId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (org.networkOptedInAtMs !== null) {
    return Response.json({ ok: true, networkOptedInAtMs: org.networkOptedInAtMs });
  }

  const identityEncrypted = getOrgIdentityEncrypted(db, orgId);
  if (identityEncrypted === null) {
    return Response.json({ error: "Organization identity not found" }, { status: 500 });
  }

  await registerOrgDidOnNetwork({
    identityEncrypted,
    orgId,
    orgName: org.name,
  });

  const networkOptedInAtMs = setOrgNetworkOptedIn(db, orgId);
  return Response.json({ ok: true, networkOptedInAtMs });
}

export async function handleMarketingOptIn(req: Request): Promise<Response> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return auth.response;

  const db = getDb();
  const user = await getOrCreateUserForAuth(db, req, auth.session);
  if (user.marketingOptedInAtMs !== null) {
    return Response.json({ ok: true, marketingOptedInAtMs: user.marketingOptedInAtMs });
  }

  const email = user.email ?? auth.session.user.email ?? null;
  if (email !== null) {
    const registryUrl = getRegistryUrl().replace(/\/$/, "");
    try {
      await fetch(`${registryUrl}/v1/marketing/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          listSlug: MARKETING_LIST_SLUG,
          sourceApp: "exedra",
        }),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "marketing subscribe failed";
      logger.warn({ err: message }, "marketing subscribe failed");
    }
  }

  const marketingOptedInAtMs = setUserMarketingOptedIn(db, user.id);
  return Response.json({ ok: true, marketingOptedInAtMs });
}
