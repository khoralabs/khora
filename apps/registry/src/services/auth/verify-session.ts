import type { RegistrySession } from "@khoralabs/khora-registry/host";

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

  const data = (await res.json()) as {
    user?: { id?: string; email?: string | null };
    session?: { id?: string; expiresAt?: Date };
  } | null;
  if (data === null || data.user?.id === undefined || data.session?.id === undefined) {
    return null;
  }
  return {
    user: { id: data.user.id, email: data.user.email ?? null },
    session: {
      id: data.session.id,
      expiresAt: data.session.expiresAt ?? new Date(0),
    },
  };
}
