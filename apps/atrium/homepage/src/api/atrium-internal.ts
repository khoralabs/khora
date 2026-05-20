export function atriumBaseUrl(): string | undefined {
  const url = process.env.ATRIUM_BASE_URL?.trim();
  if (url === undefined || url.length === 0) return undefined;
  return url.replace(/\/$/, "");
}

export function internalSecret(): string | undefined {
  const s = process.env.ATRIUM_INTERNAL_SECRET?.trim();
  if (s === undefined || s.length === 0) return undefined;
  return s;
}

export function configErrorResponse(): Response {
  return Response.json(
    {
      error:
        "Atrium internal API is not configured (set ATRIUM_BASE_URL and ATRIUM_INTERNAL_SECRET)",
    },
    { status: 503 },
  );
}

export async function fetchAtriumInternal(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const base = atriumBaseUrl();
  const secret = internalSecret();
  if (base === undefined || secret === undefined) {
    return configErrorResponse();
  }

  const url = path.startsWith("/") ? `${base}${path}` : `${base}/${path}`;
  return fetch(url, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${secret}`,
    },
  });
}
