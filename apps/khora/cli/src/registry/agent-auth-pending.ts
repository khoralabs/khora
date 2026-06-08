import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const PENDING_FILE = process.env.KHORA_AGENT_AUTH_PENDING_FILE?.trim();

export type AgentAuthPending = {
  email: string;
  claimToken: string;
  registrationId: string;
  createdAtMs: number;
};

function pendingFilePath(): string {
  if (PENDING_FILE !== undefined && PENDING_FILE.length > 0) return PENDING_FILE;
  const home = process.env.HOME ?? process.env.USERPROFILE;
  if (home === undefined || home.length === 0) {
    throw new Error("HOME is not set; cannot store agent auth pending state");
  }
  return path.join(home, ".khora", "agent-auth-pending.json");
}

export function readAgentAuthPending(): AgentAuthPending | null {
  const filePath = pendingFilePath();
  if (!existsSync(filePath)) return null;
  try {
    const text = readFileSync(filePath, "utf8");
    if (text.trim().length === 0) return null;
    const json = JSON.parse(text) as AgentAuthPending;
    if (
      typeof json.email === "string" &&
      typeof json.claimToken === "string" &&
      json.email.length > 0 &&
      json.claimToken.length > 0
    ) {
      return json;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function writeAgentAuthPending(pending: AgentAuthPending): void {
  const filePath = pendingFilePath();
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(pending, null, 2));
}

export function clearAgentAuthPending(): void {
  const filePath = pendingFilePath();
  if (existsSync(filePath)) {
    writeFileSync(filePath, "");
  }
}
