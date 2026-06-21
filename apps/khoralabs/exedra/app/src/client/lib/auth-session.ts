export type AuthSessionResponse =
  | {
      authenticated: true;
      user: { id: string };
      session: { id: string; expiresAt: string | Date };
    }
  | { authenticated: false };

export async function fetchAuthSession(): Promise<AuthSessionResponse | null> {
  const res = await fetch("/api/auth/session", { credentials: "include" });
  if (res.status === 401) {
    return { authenticated: false };
  }
  if (!res.ok) {
    return null;
  }
  return (await res.json()) as AuthSessionResponse;
}

export async function signOutAuthSession(): Promise<void> {
  await fetch("/api/auth/sign-out", { method: "POST", credentials: "include" });
}
