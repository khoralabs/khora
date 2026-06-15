export type StubRegistryUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
  updatedAt: string;
};

export type StubRegistrySession = {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  createdAt: string;
  updatedAt: string;
};

const otps = new Map<string, { otp: string; expiresAtMs: number }>();
const sessionsByToken = new Map<string, StubRegistrySession>();
const usersByEmail = new Map<string, StubRegistryUser>();

const OTP_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function normalizeStubEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function setStubOtp(email: string, otp: string): void {
  otps.set(normalizeStubEmail(email), { otp, expiresAtMs: Date.now() + OTP_TTL_MS });
}

export function verifyStubOtp(email: string, otp: string): boolean {
  const entry = otps.get(normalizeStubEmail(email));
  if (entry === undefined) return false;
  if (entry.expiresAtMs <= Date.now()) {
    otps.delete(normalizeStubEmail(email));
    return false;
  }
  if (entry.otp !== otp) return false;
  otps.delete(normalizeStubEmail(email));
  return true;
}

export function getOrCreateStubUser(email: string): StubRegistryUser {
  const key = normalizeStubEmail(email);
  const existing = usersByEmail.get(key);
  if (existing !== undefined) return existing;

  const now = new Date().toISOString();
  const user: StubRegistryUser = {
    id: crypto.randomUUID().replace(/-/g, ""),
    email: key,
    name: "",
    role: "user",
    createdAt: now,
    updatedAt: now,
  };
  usersByEmail.set(key, user);
  return user;
}

export function createStubSession(user: StubRegistryUser): StubRegistrySession {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  const token = `stub.${crypto.randomUUID()}`;
  const session: StubRegistrySession = {
    id: crypto.randomUUID().replace(/-/g, ""),
    userId: user.id,
    token,
    expiresAt,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  sessionsByToken.set(token, session);
  return session;
}

export function getStubSessionByToken(token: string): StubRegistrySession | null {
  const session = sessionsByToken.get(token);
  if (session === undefined) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    sessionsByToken.delete(token);
    return null;
  }
  return session;
}

export function getStubUserById(userId: string): StubRegistryUser | null {
  for (const user of usersByEmail.values()) {
    if (user.id === userId) return user;
  }
  return null;
}

export function revokeStubSession(token: string): void {
  sessionsByToken.delete(token);
}

export function resetStubRegistryStore(): void {
  otps.clear();
  sessionsByToken.clear();
  usersByEmail.clear();
}
