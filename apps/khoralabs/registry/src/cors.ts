export function readTrustedOrigins(): string[] {
  const port = process.env.PORT?.trim() ?? "4000";
  const registryUrl =
    process.env.REGISTRY_URL?.trim()?.replace(/\/$/, "") ?? `http://localhost:${port}`;
  const envOrigins =
    process.env.REGISTRY_TRUSTED_ORIGINS?.trim()
      .split(",")
      .map((o) => o.trim())
      .filter((o) => o.length > 0) ?? [];
  return [
    ...new Set([
      registryUrl,
      `http://localhost:${port}`,
      `http://127.0.0.1:${port}`,
      ...envOrigins,
    ]),
  ];
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
