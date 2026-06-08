import {
  consumeClaimToken,
  createAgentAuthRegistration,
  deviceSessionCookie,
  expireAgentAuthIfNeeded,
  findAgentAuthByClaimToken,
  findBlockedEmail,
  findPendingAgentAuthByEmail,
  normalizeEmail,
  verifyAgentAuthOtp,
} from "@khoralabs/registry-accounts";
import { getRegistryAuth, getRegistryDatabase } from "@khoralabs/registry-auth";
import { registryPublicUrl } from "./resolve-host";

const AGENT_AUTH_SCOPES = ["registry.session", "link.agent"] as const;
const AUTH_MD_URL = process.env.KHORA_AUTH_MD_URL?.trim() || "https://khoralabs.com/auth.md";

const rateLimit = new Map<string, { count: number; resetAtMs: number }>();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 8;

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

function assertEmailAllowed(email: string): void {
  const blocked = findBlockedEmail(getRegistryDatabase(), email);
  if (blocked !== null) {
    throw new Error("email blocked");
  }
}

async function callAuthEndpoint(path: string, body: unknown): Promise<Response> {
  const base = registryPublicUrl();
  return getRegistryAuth().handler(
    new Request(`${base}/api/auth${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function sessionCookieFromAuthResponse(res: Response): string | null {
  const cookies = res.headers.getSetCookie?.() ?? [];
  for (const raw of cookies) {
    const part = raw.split(";")[0]?.trim();
    if (
      part !== undefined &&
      (part.startsWith("better-auth.session_token=") ||
        part.startsWith("__Secure-better-auth.session_token="))
    ) {
      return part;
    }
  }
  return null;
}

export function handleOAuthProtectedResourceMetadata(): Response {
  const base = registryPublicUrl();
  return Response.json({
    resource: `${base}/`,
    resource_name: "Khora Registry",
    authorization_servers: [base],
    scopes_supported: [...AGENT_AUTH_SCOPES],
    bearer_methods_supported: ["header"],
  });
}

export function handleOAuthAuthorizationServerMetadata(): Response {
  const base = registryPublicUrl();
  return Response.json({
    resource: `${base}/`,
    authorization_servers: [base],
    scopes_supported: [...AGENT_AUTH_SCOPES],
    bearer_methods_supported: ["header"],
    issuer: base,
    agent_auth: {
      skill: AUTH_MD_URL,
      register_uri: `${base}/agent/auth`,
      claim_complete_uri: `${base}/agent/auth/claim/complete`,
      identity_types_supported: ["identity_assertion"],
      identity_assertion: {
        assertion_types_supported: ["verified_email"],
      },
    },
  });
}

export async function handleAgentAuthRegister(req: Request): Promise<Response> {
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

  try {
    assertEmailAllowed(email);
  } catch {
    return Response.json({ error: "email blocked" }, { status: 403 });
  }

  const db = getRegistryDatabase();
  const { registration, claimToken } = createAgentAuthRegistration(db, { email });

  const sendRes = await callAuthEndpoint("/email-otp/send-verification-otp", {
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

export async function handleAgentAuthClaimComplete(req: Request): Promise<Response> {
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

  const db = getRegistryDatabase();
  let registration = claimToken.length > 0 ? findAgentAuthByClaimToken(db, claimToken) : null;
  if (registration === null && emailRaw.length > 0) {
    registration = findPendingAgentAuthByEmail(db, emailRaw);
  }
  if (registration === null) {
    return Response.json({ error: "registration not found" }, { status: 404 });
  }

  registration = expireAgentAuthIfNeeded(db, registration);
  if (registration.status === "expired") {
    return Response.json({ error: "registration expired" }, { status: 400 });
  }
  if (registration.status !== "pending_claim") {
    return Response.json({ error: "registration already claimed" }, { status: 400 });
  }

  if (registration.otpHash !== null && !verifyAgentAuthOtp(registration, otp)) {
    return Response.json({ error: "invalid otp" }, { status: 401 });
  }

  const signInRes = await callAuthEndpoint("/sign-in/email-otp", {
    email: registration.email,
    otp,
  });
  if (!signInRes.ok) {
    return Response.json({ error: "invalid otp" }, { status: 401 });
  }

  let sessionCookie = sessionCookieFromAuthResponse(signInRes);
  if (sessionCookie === null) {
    const json = (await signInRes.json()) as { token?: string };
    if (typeof json.token === "string" && json.token.length > 0) {
      sessionCookie = deviceSessionCookie(json.token);
    }
  }
  if (sessionCookie === null) {
    return Response.json({ error: "session cookie unavailable" }, { status: 500 });
  }

  const consumed = consumeClaimToken(db, registration.id);
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
