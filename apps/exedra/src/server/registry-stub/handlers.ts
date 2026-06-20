import { logger } from "../logger.js";
import { getStubRegistryOtp } from "./config.js";
import {
  createStubSession,
  getOrCreateStubUser,
  getStubSessionByToken,
  getStubUserById,
  normalizeStubEmail,
  revokeStubSession,
  type StubRegistrySession,
  type StubRegistryUser,
  setStubOtp,
  verifyStubOtp,
} from "./store.js";

const SESSION_COOKIE = "better-auth.session_token";
const SESSION_MAX_AGE_SEC = 7 * 24 * 60 * 60;

function parseJsonBody<T>(req: Request): Promise<T | null> {
  return req
    .json()
    .then((body) => body as T)
    .catch(() => null);
}

function sessionTokenFromRequest(req: Request): string | null {
  const cookie = req.headers.get("cookie");
  if (cookie === null || cookie.length === 0) return null;
  for (const part of cookie.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${SESSION_COOKIE}=`)) {
      return decodeURIComponent(trimmed.slice(SESSION_COOKIE.length + 1));
    }
  }
  return null;
}

function userWire(user: StubRegistryUser) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: true,
    image: null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    role: user.role,
  };
}

function sessionWire(session: StubRegistrySession) {
  return {
    id: session.id,
    userId: session.userId,
    token: session.token,
    expiresAt: session.expiresAt.toISOString(),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    ipAddress: "",
    userAgent: "",
  };
}

function withSessionCookie(res: Response, token: string): Response {
  const headers = new Headers(res.headers);
  headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Max-Age=${SESSION_MAX_AGE_SEC}; Path=/; HttpOnly; SameSite=Lax`,
  );
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

function withClearedSessionCookie(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.append("Set-Cookie", `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export async function handleStubSignOut(req: Request): Promise<Response> {
  const token = sessionTokenFromRequest(req);
  if (token !== null) {
    revokeStubSession(token);
  }
  return withClearedSessionCookie(Response.json({ success: true }));
}

export async function handleStubSendVerificationOtp(req: Request): Promise<Response> {
  const body = await parseJsonBody<{ email?: unknown; type?: unknown }>(req);
  const email = typeof body?.email === "string" ? normalizeStubEmail(body.email) : "";
  if (email.length === 0 || !email.includes("@")) {
    return Response.json({ message: "email required" }, { status: 400 });
  }

  const otp = getStubRegistryOtp();
  setStubOtp(email, otp);
  logger.info({ email, otp }, "stub registry OTP issued");

  return Response.json({ success: true });
}

export async function handleStubSignInEmailOtp(req: Request): Promise<Response> {
  const body = await parseJsonBody<{ email?: unknown; otp?: unknown }>(req);
  const email = typeof body?.email === "string" ? normalizeStubEmail(body.email) : "";
  const otp = typeof body?.otp === "string" ? body.otp.trim() : "";

  if (email.length === 0 || !email.includes("@")) {
    return Response.json({ message: "email required" }, { status: 400 });
  }
  if (otp.length === 0) {
    return Response.json({ message: "otp required" }, { status: 400 });
  }
  if (!verifyStubOtp(email, otp)) {
    return Response.json({ message: "Invalid OTP", code: "INVALID_OTP" }, { status: 400 });
  }

  const user = getOrCreateStubUser(email);
  const session = createStubSession(user);
  const res = Response.json({
    token: session.token,
    user: userWire(user),
  });
  return withSessionCookie(res, session.token);
}

export async function handleStubGetSession(req: Request): Promise<Response> {
  const token = sessionTokenFromRequest(req);
  if (token === null) {
    return new Response("null", { status: 200, headers: { "Content-Type": "application/json" } });
  }

  const session = getStubSessionByToken(token);
  if (session === null) {
    return new Response("null", { status: 200, headers: { "Content-Type": "application/json" } });
  }

  const user = getStubUserById(session.userId);
  if (user === null) {
    return new Response("null", { status: 200, headers: { "Content-Type": "application/json" } });
  }

  return Response.json({
    session: sessionWire(session),
    user: userWire(user),
  });
}
