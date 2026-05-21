import type { RegistrySession } from "./session";

export async function verifyRegistrySession(
  req: Request,
  opts: { registryUrl: string },
): Promise<RegistrySession | null> {
  const cookie = req.headers.get("cookie");
  if (cookie === null || cookie.length === 0) return null;

  const base = opts.registryUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/api/auth/get-session`, {
    headers: { cookie },
  });
  if (!res.ok) return null;

  const data = (await res.json()) as RegistrySession | null;
  if (data === null || data.user?.id === undefined) return null;
  return data;
}
