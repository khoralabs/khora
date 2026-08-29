import {
  consumeClaimToken,
  createAgentAuthRegistration,
  expireAgentAuthIfNeeded,
  findAgentAuthByClaimToken,
  findBlockedEmail,
  findPendingAgentAuthByEmail,
  normalizeEmail,
  verifyAgentAuthOtp,
} from "@khoralabs/registry/accounts";
import type { RegistryDatabase } from "@khoralabs/registry/persistence";
import type { RegistryAuthHttpPort } from "../ports/identity";

const AGENT_AUTH_SCOPES = ["registry.session", "link.agent"] as const;

const rateLimit = new Map<string, { count: number; resetAtMs: number }>();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 8;

export type AgentAuthRouteDeps = {
  db: RegistryDatabase;
  publicUrl: () => string;
  authMdUrl: string;
  resourceName: string;
  authHttp: RegistryAuthHttpPort;
};

function clientKey(req: Request, email?: string): string {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip")?.trim() ??
    "unknown";
  return email !== undefined ? `${ip}:${email}` : ip;
}

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimit.get(key);
  if (entry === undefined || entry.resetAtMs <= now) {
    rateLimit.set(key, { count: 1, resetAtMs: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count += 1;
  return true;
}

async function callAuthJson(
  authHttp: RegistryAuthHttpPort,
  path: string,
  body: unknown,
): Promise<Response> {
  return authHttp.callAuthEndpoint(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function handleOAuthProtectedResourceMetadata(
  deps: AgentAuthRouteDeps,
): Promise<Response> {
  const base = deps.publicUrl();
  return Response.json({
    resource: `${base}/`,
    resource_name: deps.resourceName,
    authorization_servers: [base],
    scopes_supported: [...AGENT_AUTH_SCOPES],
    bearer_methods_supported: ["header"],
  });
}

export async function handleOAuthAuthorizationServerMetadata(
  deps: AgentAuthRouteDeps,
): Promise<Response> {
  const base = deps.publicUrl();
  return Response.json({
    resource: `${base}/`,
    authorization_servers: [base],
    scopes_supported: [...AGENT_AUTH_SCOPES],
    bearer_methods_supported: ["header"],
    issuer: base,
    agent_auth: {
      skill: deps.authMdUrl,
      register_uri: `${base}/agent/auth`,
      claim_complete_uri: `${base}/agent/auth/claim/complete`,
      identity_types_supported: ["identity_assertion"],
      identity_assertion: {
        assertion_types_supported: ["verified_email"],
      },
    },
  });
}

export async function handleAgentAuthRegister(
  req: Request,
  deps: AgentAuthRouteDeps,
): Promise<Response> {
  let body: {
    type?: unknown;
    assertion_type?: unknown;
    email?: unknown;
    assertion?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  if (body.type !== "identity_assertion" || body.assertion_type !== "verified_email") {
    return Response.json(
      { error: "Only identity_assertion with verified_email is supported" },
      { status: 400 },
    );
  }

  const rawEmail =
    typeof body.email === "string"
      ? body.email
      : typeof body.assertion === "string"
        ? body.assertion
        : "";
  const email = normalizeEmail(rawEmail);
  if (email.length === 0 || !email.includes("@")) {
    return Response.json({ error: "email required" }, { status: 400 });
  }

  if (!checkRateLimit(clientKey(req, email))) {
    return Response.json({ error: "rate limit exceeded" }, { status: 429 });
  }

  if ((await findBlockedEmail(deps.db, email)) !== null) {
    return Response.json({ error: "email blocked" }, { status: 403 });
  }

  const { registration, claimToken } = await createAgentAuthRegistration(deps.db, { email });

  const sendRes = await callAuthJson(deps.authHttp, "/email-otp/send-verification-otp", {
    email,
    type: "sign-in",
  });
  if (!sendRes.ok) {
    return Response.json({ error: "failed to send OTP" }, { status: 500 });
  }

  return Response.json({
    registration_id: registration.id,
    claim_token: claimToken,
    status: "pending_claim",
  });
}

export async function handleAgentAuthClaimComplete(
  req: Request,
  deps: AgentAuthRouteDeps,
): Promise<Response> {
  let body: { claim_token?: unknown; email?: unknown; otp?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  const otp = typeof body.otp === "string" ? body.otp.trim() : "";
  if (otp.length === 0) {
    return Response.json({ error: "otp required" }, { status: 400 });
  }

  const claimToken = typeof body.claim_token === "string" ? body.claim_token.trim() : "";
  const emailRaw = typeof body.email === "string" ? body.email.trim() : "";

  if (!checkRateLimit(clientKey(req, emailRaw || claimToken || "claim"))) {
    return Response.json({ error: "rate limit exceeded" }, { status: 429 });
  }

  let registration =
    claimToken.length > 0 ? await findAgentAuthByClaimToken(deps.db, claimToken) : null;
  if (registration === null && emailRaw.length > 0) {
    registration = await findPendingAgentAuthByEmail(deps.db, emailRaw);
  }
  if (registration === null) {
    return Response.json({ error: "registration not found" }, { status: 404 });
  }

  registration = await expireAgentAuthIfNeeded(deps.db, registration);
  if (registration.status === "expired") {
    return Response.json({ error: "registration expired" }, { status: 400 });
  }
  if (registration.status !== "pending_claim") {
    return Response.json({ error: "registration already claimed" }, { status: 400 });
  }

  if (registration.otpHash !== null && !verifyAgentAuthOtp(registration, otp)) {
    return Response.json({ error: "invalid otp" }, { status: 401 });
  }

  const signInRes = await callAuthJson(deps.authHttp, "/sign-in/email-otp", {
    email: registration.email,
    otp,
  });
  if (!signInRes.ok) {
    return Response.json({ error: "invalid otp" }, { status: 401 });
  }

  let sessionCookie = deps.authHttp.extractSessionCookie(signInRes);
  if (sessionCookie === null) {
    const json = (await signInRes.json()) as { token?: string };
    if (typeof json.token === "string" && json.token.length > 0) {
      sessionCookie = deps.authHttp.formatSessionCookie(json.token);
    }
  }
  if (sessionCookie === null) {
    return Response.json({ error: "session cookie unavailable" }, { status: 500 });
  }

  const consumed = await consumeClaimToken(deps.db, registration.id);
  if (consumed === null) {
    return Response.json({ error: "claim failed" }, { status: 500 });
  }

  const resBody = {
    status: "claimed",
    credential: {
      type: "session",
      session_cookie: sessionCookie,
    },
  };

  const headers = new Headers({ "Content-Type": "application/json" });
  for (const cookie of signInRes.headers.getSetCookie?.() ?? []) {
    headers.append("Set-Cookie", cookie);
  }

  return new Response(JSON.stringify(resBody), { headers });
}
