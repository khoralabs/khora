import { readRegistryTrustedOrigins } from "./trusted-origins";

export async function readTrustedOrigins(): Promise<string[]> {
  return readRegistryTrustedOrigins();
}

export function corsHeadersForTrustedOrigins(
  trusted: string[],
  origin: string | null,
): HeadersInit {
  if (origin !== null && trusted.includes(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };
  }
  return {};
}

export async function corsHeaders(origin: string | null): Promise<HeadersInit> {
  return corsHeadersForTrustedOrigins(await readTrustedOrigins(), origin);
}

export async function withCors(req: Request, res: Response): Promise<Response> {
  const headers = new Headers(res.headers);
  for (const [key, value] of Object.entries(await corsHeaders(req.headers.get("origin")))) {
    headers.set(key, value);
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export async function handleOptions(req: Request): Promise<Response | null> {
  if (req.method !== "OPTIONS") return null;
  return new Response(null, { status: 204, headers: await corsHeaders(req.headers.get("origin")) });
}
