# @khoralabs/vellum-cli

NBC room CLI: connect, chain/offer/port commands, and local daemon control with on-disk room storage (SQLite).

## Install (npm release)

```bash
npm  i -g @khoralabs/vellum-cli
pnpm add -g @khoralabs/vellum-cli
bun  i -g @khoralabs/vellum-cli
```

Native binaries ship for macOS arm64, Linux x64, and Linux arm64. No separate Node/Bun runtime is required for the published package.

If your package manager blocks `postinstall` (for example Bun’s default), run **`vellum setup`** once after install to copy canonical configs into `~/.vellum/`. The compiled CLI also bootstraps on first run when installed from the npm meta package.

## Development

```bash
bun install
bun run ./apps/vellum/cli/src/cli.ts --help
```

Regenerate the JSON Schema after changing the Zod model:

```bash
bun run --cwd packages/vellum/client build:schema
```

## Configuration

Configuration is loaded with **`@khoralabs/vellum-client`**: layers merge in order **built-in defaults** → **environment variables** → **resolved JSON file** (including any `extends` chain). Later layers override earlier ones for the same key. Command-line flags override loaded settings when a command supports them.

The default `baseUrl` when nothing else sets it is **`https://atr1.khoralabs.com`**. The default `dataDir` is **`~/.vellum/data`** (room database and `vellum.json` under `…/obp/rooms/…`). See `VELLUM_CANONICAL_BASE_URL`, `vellumDefaultDataDir()`, and `vellumAppConfigBuiltinDefaults()` in `@khoralabs/vellum-client`.

Discovery order for the CLI config file:

1. `--config <path>`
2. `VELLUM_CONFIG`
3. `~/.vellum/cli.config.json` if it exists

`vellum setup` copies `base.config.json`, `cli.config.json`, `daemon.config.json`, and `vellum-config.schema.json` from the package into `~/.vellum/`. Use **`vellum setup --force`** to overwrite existing files. The published package also ships **`configs/config.example.json`** (every schema field) as a read-only reference inside the install tree; it is not copied into `~/.vellum/`.

Editor IntelliSense: point `"$schema": "./vellum-config.schema.json"` at the file next to your config (as in the shipped templates).

### Environment variables

| Variable | Used for |
| --- | --- |
| `VELLUM_BASE_URL`, `VELLUM_ATRIUM_BASE_URL`, `AT2_BASE_URL` | Host HTTP URL |
| `VELLUM_DATA_DIR` | Room data root (layout `…/obp/rooms/<room>/…`; preferred) |
| `AT2_DATA_DIR`, `ATRIUM_DATA_DIR` | Same as `VELLUM_DATA_DIR` (legacy names) |
| `VELLUM_OBP_STORE_ROOT` | Override the `…/obp` directory (rare; legacy: `ATRIUM_OBP_STORE_ROOT`) |
| `VELLUM_AGENT_KEY_PATH`, `ATRIUM_AGENT_KEY_PATH`, `AT2_AGENT_KEY_PATH` | Identity JSON path |
| `VELLUM_ROOM_ID`, `ATRIUM_ROOM_ID` | Default room id |
| `VELLUM_ROOM_WS_URL` | Default room WebSocket URL |
| `VELLUM_CONFIG` | Explicit config file path |
| `VELLUM_CLI_ASSETS_DIR` | Set by the npm launcher; assets root for bootstrap |
| `VELLUM_DAEMON_BIN` | Native daemon binary path (packaged install) |

### Where files live

| Path | Role |
| --- | --- |
| `~/.vellum/*.config.json` | Layered JSON config |
| `~/.vellum/vellum-config.schema.json` | JSON Schema for editors |
| `~/.vellum/data/obp/rooms/…` | Default per-room SQLite + `vellum.json` (unless `dataDir` / env overrides) |
| `~/.atrium/identity.json` | Default agent identity path (see `VELLUM_AGENT_KEY_PATH` / Atrium env vars) |

Account removal on the Atrium host (when supported) is via the Atrium CLI (`atrium unregister --yes`); see `apps/atrium/README.md` and `apps/vellum/README.md`.

## License

MIT.
