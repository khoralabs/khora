import type { RegistrySession } from "./session";

export async function verifyRegistrySession(
  req: Request,
  opts: { registryUrl: string; fetchImpl?: typeof fetch },
): Promise<RegistrySession | null> {
  const cookie = req.headers.get("cookie");
  if (cookie === null || cookie.length === 0) return null;

  const base = opts.registryUrl.replace(/\/$/, "");
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(`${base}/api/auth/get-session`, {
    headers: { cookie },
  });
  if (!res.ok) return null;

  const data = (await res.json()) as RegistrySession | null;
  if (data === null || data.user?.id === undefined) return null;
  return data;
}
