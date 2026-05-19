import { RedisClient } from "bun";

const KEY_PREFIX = "waitlist:email:";

export type WaitlistEntry = {
  status: "pending" | "minted" | "sent";
  token?: string;
  createdAt: number;
};

function redisUrl(): string {
  const url = process.env.REDIS_URL?.trim();
  if (url === undefined || url.length === 0) {
    throw new Error("REDIS_URL is required for waitlist storage");
  }
  return url;
}

let client: RedisClient | undefined;

function redis(): RedisClient {
  if (client === undefined) {
    client = new RedisClient(redisUrl());
  }
  return client;
}

function keyForEmail(email: string): string {
  return `${KEY_PREFIX}${email.trim().toLowerCase()}`;
}

export async function setEmailIfAbsent(email: string): Promise<boolean> {
  const entry: WaitlistEntry = { status: "pending", createdAt: Date.now() };
  const result = await redis().set(keyForEmail(email), JSON.stringify(entry), "NX");
  return result === "OK";
}

export async function setTokenForEmail(email: string, token: string): Promise<void> {
  const k = keyForEmail(email);
  const raw = await redis().get(k);
  if (raw === null) {
    throw new Error(`waitlist entry missing for ${email}`);
  }
  const prev = JSON.parse(String(raw)) as WaitlistEntry;
  const next: WaitlistEntry = { ...prev, status: "minted", token };
  await redis().set(k, JSON.stringify(next));
}

export async function markEmailSent(email: string): Promise<void> {
  const k = keyForEmail(email);
  const raw = await redis().get(k);
  if (raw === null) return;
  const prev = JSON.parse(String(raw)) as WaitlistEntry;
  const next: WaitlistEntry = { ...prev, status: "sent" };
  await redis().set(k, JSON.stringify(next));
}

export async function getWaitlistEntry(email: string): Promise<WaitlistEntry | null> {
  const raw = await redis().get(keyForEmail(email));
  if (raw === null) return null;
  return JSON.parse(String(raw)) as WaitlistEntry;
}
