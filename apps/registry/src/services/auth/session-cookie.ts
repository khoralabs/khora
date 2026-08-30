const SESSION_COOKIE_NAMES = ["__Secure-better-auth.session_token", "better-auth.session_token"];

export function formatBetterAuthSessionCookie(sessionToken: string): string {
  if (sessionToken.includes("=")) return sessionToken;
  return `better-auth.session_token=${sessionToken}`;
}

export function extractBetterAuthSessionCookie(res: Response): string | null {
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

export function getBetterAuthSessionCookieHeader(req: Request): string | null {
  const cookieHeader = req.headers.get("cookie");
  if (cookieHeader === null || cookieHeader.length === 0) return null;

  const cookies = new Map<string, string>();
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (trimmed.length === 0) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const name = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    cookies.set(name, value);
  }

  for (const name of SESSION_COOKIE_NAMES) {
    const value = cookies.get(name);
    if (value !== undefined && value.length > 0) {
      return `${name}=${value}`;
    }
  }
  return null;
}
