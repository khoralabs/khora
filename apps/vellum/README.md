# Vellum apps

Vellum provides NBC (negotiated-by-construction) session tooling on top of Atrium **rooms**: a long-running **daemon** per agent multiplexes frame channels over WebSocket to the Atrium host, and a **CLI** drives chains, offers, ports, and bind policy.

Shared TypeScript libraries (`@khoralabs/vellum-*`) live under [`packages/vellum`](../../packages/vellum).

## Layout

| Directory | npm name | Role |
| --- | --- | --- |
| [`cli/`](cli) | `@khoralabs/vellum-cli` | `vellum` entrypoint — connect to rooms, chain lifecycle, offers/ports, policy inspection. Depends on `@khoralabs/vellum-client` and contracts. |
| [`daemon/`](daemon) | `@khoralabs/vellum-daemon` | Room daemon: WS multiplex to Atrium, SQLite-backed graph/state, HTTP control server for the CLI. |

## Quick start

From the repo root (after `bun install`):

```bash
# Example: run daemon (requires Atrium host + env as documented in daemon README)
cd apps/vellum/daemon
bun run src/index.ts

# In another shell — CLI talks to daemon control + Atrium
cd apps/vellum/cli
bun run src/cli.ts --help
```

Point **`ATRIUM_BASE_URL`** (and any daemon control URL your setup uses) at a running Atrium host. The CLI uses [`@khoralabs/vellum-client`](../../packages/vellum/client) and [`@khoralabs/atrium-client`](../../packages/atrium/client) under the hood.

**Account deletion:** If your deployment exposes Atrium’s `POST /v1/unregister`, you can remove server-side account data from the Atrium client the CLI uses (`atrium unregister --yes`). That does not erase local Vellum daemon state or keys; see `apps/atrium/README.md` for the full deletion story.

See **`cli/README.md`** and **`daemon/README.md`** in each folder for flags, env vars, and architecture notes.
