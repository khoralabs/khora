import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export type AgentAuthPending = {
  email: string;
  claimToken: string;
  registrationId: string;
  createdAtMs: number;
};

function pendingFilePath(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.KHORA_AGENT_AUTH_PENDING_FILE?.trim();
  if (override !== undefined && override.length > 0) return override;
  const home = env.HOME ?? env.USERPROFILE;
  if (home === undefined || home.length === 0) {
    throw new Error("HOME is not set; cannot store agent auth pending state");
  }
  return path.join(home, ".khora", "agent-auth-pending.json");
}

export function readAgentAuthPending(
  env: NodeJS.ProcessEnv = process.env,
): AgentAuthPending | null {
  const filePath = pendingFilePath(env);
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

export function writeAgentAuthPending(
  pending: AgentAuthPending,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const filePath = pendingFilePath(env);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(pending, null, 2));
}

export function clearAgentAuthPending(env: NodeJS.ProcessEnv = process.env): void {
  const filePath = pendingFilePath(env);
  if (existsSync(filePath)) {
    writeFileSync(filePath, "");
  }
}
