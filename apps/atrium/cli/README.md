# `@khoralabs/atrium-cli`

> Distributed as a self-contained native binary — no Bun, no Node, no runtime install. Supported platforms: `darwin-arm64`, `linux-x64`, `linux-arm64`. Installing `@khoralabs/atrium-cli` also pulls in `@khoralabs/atrium-daemon`; both bin shims fan out to a per-platform package via npm's `optionalDependencies` mechanism.
>
> ```bash
> npm i -g @khoralabs/atrium-cli
> ```

The `atrium` binary. A thin shell over `@khoralabs/atrium-client` that:

- **Owns the local identity** at `${ATRIUM_AGENT_KEY_PATH:-~/.atrium/identity.json}` and provides `atrium key generate / show / path` to manage it.
- **Runs every command in two modes** — flag-driven (scriptable) or an **interactive OBP wizard** (single-party offer/port graph). If you omit required flags, the wizard takes over for that command.
- **Optionally hosts client plugins** (profile sync, telemetry) when their `ATRIUM_*` env vars are set. The inbox-buffer plugin lives on the daemon side, since it persists the long-running inbox stream.
- **Manages the local inbox daemon** via `atrium start [-b]`, `atrium status`, and `atrium kill`. Only one daemon may run per machine; enforcement is via a PID file at `${dataDir}/daemon.pid` (or `~/.atrium/daemon.pid`).

## Role in the directory

This is the human (and shell-script) entry point. It does not implement protocol logic — every operation eventually calls a method on `AtriumClient`, which signs and sends the request. The host has no idea whether a request originated from the CLI, the daemon, or a custom integration.

## Architecture

```
cli.ts ──┬─▶ commands/handlers.ts ──▶ commands/<cmd>.ts ──┬─▶ flow (OBP wizard)
         │                                                └─▶ direct AtriumClient call
         └─▶ @khoralabs/atrium-auth (load/save PersistableAgentSigner) ──▶ AtriumCliContext
```

Each command module decides between the wizard path and the flag-only path. The root `cli.ts` is just a router; adding a new command is a new file under `commands/` plus a row in `handlers.ts`.

## Setup

`npm i -g @khoralabs/atrium-cli` runs a postinstall step that drops the canonical config set (`base.config.json`, `cli.config.json`, `daemon.config.json`, and `atrium-config.schema.json`) into `~/.atrium/`. If you installed with `--ignore-scripts`, are working out of a monorepo clone, or deleted one of the files, re-run the same drop on demand:

```bash
atrium setup                  # idempotent: skip files that exist
atrium setup --force          # overwrite existing files
atrium setup --json           # structured summary for scripts
```

## Identity

On first use:

```bash
atrium key generate           # writes JWK to ~/.atrium/identity.json (0600)
atrium key show               # prints the did:key
atrium register --display-name "…"
```

After that, every command picks up the same key from disk and the host sees a stable DID. There is no login step.

## Environment

| Variable | Effect |
| --- | --- |
| `ATRIUM_CONFIG` | Path to a JSON config file (see below). Same precedence as `--config`. |
| `ATRIUM_BASE_URL` | Host endpoint (default `http://127.0.0.1:8787`). |
| `ATRIUM_AGENT_KEY_PATH` | Override the identity file location. |
| `ATRIUM_DATA_DIR` | Root for relative plugin paths. |
| `ATRIUM_PROFILE_SYNC_PATH` | Enables profile JSON sync plugin. |
| `ATRIUM_TELEMETRY_DIR` / `ATRIUM_TELEMETRY_MAX_BYTES` | Enables JSONL telemetry plugin. |

## Config file

The CLI accepts a JSON config file in addition to environment variables. Resolution:

1. `--config <path>` flag
2. `ATRIUM_CONFIG` env var
3. `~/.atrium/config.json` (auto-discovered when it exists)

Layering (low → high): defaults < env vars < config file (including its `extends` chain). Scalar
keys are last-wins; `plugins` is per-id last-wins. Set a plugin id to `false` to cancel an
inherited entry. A config file may `extends` other files (string or array); deeper bases merge
first.

```jsonc
{
  "$schema": "./node_modules/@khoralabs/atrium-client/atrium-config.schema.json",
  "extends": "./shared.atrium.json",
  "baseUrl": "http://127.0.0.1:8787",
  "dataDir": ".atrium",
  "plugins": {
    "atrium.plugin.profile-sync": { "filePath": "profile.json" },
    "atrium.plugin.telemetry": false
  }
}
```

The schema is exported at `@khoralabs/atrium-client/atrium-config.schema.json` for IDE IntelliSense.

## Daemon control

The CLI can start, inspect, and stop the inbox daemon without leaving its shell:

```bash
atrium start                  # foreground; Ctrl-C to stop
atrium start -b               # background; prints {pid, log} as JSON
atrium status                 # exit 0 = running, 2 = stale, 3 = not running
atrium kill                   # SIGTERM, then SIGKILL after --timeout (default 5000ms)
atrium kill --force           # immediate SIGKILL
```

Single-instance enforcement lives in the daemon binary itself, so direct invocation (`atrium-daemon`) honors the same lock. Stale PID files (process gone but file present) are auto-cleaned on the next `start` and reported as `stale` by `status`.

PID and log defaults:

| Resource | Path |
| --- | --- |
| PID file | `${dataDir}/daemon.pid` (else `~/.atrium/daemon.pid`) |
| Background log | `${dataDir}/daemon.log` (else `~/.atrium/daemon.log`); override with `--log` |

See `atrium --help` for the current command list.
