export async function readJsonError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: unknown };
    if (typeof j.error === "string" && j.error.length > 0) return j.error;
  } catch {
    /* ignore */
  }
  return res.statusText || `HTTP ${res.status}`;
}

export async function fetchAdminJson<T>(
  baseUrl: string,
  path: string,
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const url = `${baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetchImpl(url);
  if (!res.ok) {
    throw new Error(await readJsonError(res));
  }
  return (await res.json()) as T;
}
