import { getRegistryDatabase } from "@khoralabs/users-auth";
import { readRegistryTrustedOrigins } from "./trusted-origins.ts";

export function readTrustedOrigins(): string[] {
  return readRegistryTrustedOrigins(getRegistryDatabase());
}

export function corsHeaders(origin: string | null): HeadersInit {
  const trusted = readTrustedOrigins();
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

export function withCors(req: Request, res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [key, value] of Object.entries(corsHeaders(req.headers.get("origin")))) {
    headers.set(key, value);
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export function handleOptions(req: Request): Response | null {
  if (req.method !== "OPTIONS") return null;
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}
