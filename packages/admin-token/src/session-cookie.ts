import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "admin_token_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function sessionSigningKey(rootToken: string): Buffer {
  return createHmac("sha256", rootToken).update("admin-token-session-v1").digest();
}

function signPayload(payload: string, key: Buffer): string {
  const sig = createHmac("sha256", key).update(payload).digest("base64url");
  return `${Buffer.from(payload, "utf8").toString("base64url")}.${sig}`;
}

function verifySigned(value: string, key: Buffer): string | null {
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const payloadB64 = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  let payload: string;
  try {
    payload = Buffer.from(payloadB64, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expected = createHmac("sha256", key).update(payload).digest("base64url");
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return payload;
}

type SessionCookieOptions = { secure?: boolean };

function cookieFlags(secure: boolean): string {
  const base = "Path=/admin; HttpOnly; SameSite=Lax";
  return secure ? `${base}; Secure` : base;
}

export function issueSessionCookie(rootToken: string, options: SessionCookieOptions = {}): string {
  const exp = Date.now() + SESSION_TTL_MS;
  const payload = JSON.stringify({ id: "root", role: "root", exp });
  const signed = signPayload(payload, sessionSigningKey(rootToken));
  const secure = options.secure ?? false;
  return `${COOKIE_NAME}=${signed}; ${cookieFlags(secure)}; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`;
}

export function clearSessionCookie(options: SessionCookieOptions = {}): string {
  const secure = options.secure ?? false;
  return `${COOKIE_NAME}=; ${cookieFlags(secure)}; Max-Age=0`;
}

export function readSessionPrincipal(
  req: Request,
  rootToken: string,
): { id: string; role: "root" } | null {
  const cookie = req.headers.get("cookie");
  if (cookie === null) return null;
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  const raw = match?.[1];
  if (raw === undefined) return null;
  const payload = verifySigned(decodeURIComponent(raw), sessionSigningKey(rootToken));
  if (payload === null) return null;
  let parsed: { id?: string; role?: string; exp?: number };
  try {
    parsed = JSON.parse(payload) as { id?: string; role?: string; exp?: number };
  } catch {
    return null;
  }
  if (parsed.exp === undefined || parsed.exp < Date.now()) return null;
  if (parsed.id !== "root" || parsed.role !== "root") return null;
  return { id: "root", role: "root" };
}

export function tokensEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
