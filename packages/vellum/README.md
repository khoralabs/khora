# Vellum packages

Shared libraries for **Vellum**: NBC session tooling on channels — contracts for control/domain wires, channel-relay HTTP client, transport primitives for daemon control, and JSON-schema validation for bind policies.

| Package | Role |
|---------|------|
| [`contracts/`](contracts) | `@khoralabs/vellum-contracts` — Zod wires, paths (`obp/channels/`), control payloads |
| [`client/`](client) | `@khoralabs/vellum-client` | `VellumClient`, `VellumChannelClient`, config, SQLite reads |
| [`transport/`](transport) | `@khoralabs/vellum-transport` | Daemon control HTTP transport |
| [`bind-policy/`](bind-policy) | `@khoralabs/vellum-bind-policy` | Bind payload validation |
