export function printDaemonHelp(): void {
  console.error(`khora-daemon — Khora inbox WebSocket daemon

Usage:
  khora-daemon [--json]
  khora-daemon --help

Keeps a multiplex WebSocket open to the Khora host inbox (GET /v1/inbox/ws).
After hello, binds your DID and receives drain / notification / snapshot frames.
Requires an Ed25519 identity at ~/.khora/identity.json — run \`khora keygen\` first.

Configuration: ~/.khora/daemon.config.json
Environment: KHORA_BASE_URL, KHORA_AGENT_KEY_PATH, KHORA_DATA_DIR, KHORA_DAEMON_JSON`);
}
