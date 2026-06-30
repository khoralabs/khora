import path from "node:path";

export function resolveAgentDataDir(): string {
  const configured = process.env.HARNESS_AGENT_DATA_DIR?.trim();
  if (configured !== undefined && configured.length > 0) return configured;
  return path.join(process.cwd(), ".harness-agent-data");
}
