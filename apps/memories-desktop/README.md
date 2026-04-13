# Memories desktop (Tauri)

Native shell for the [memories](../memories) Bun app: a WebView loads `http://127.0.0.1:31416/` (same origin as the API). A **menu bar tray icon** supports Show / Hide / Quit; closing the window hides to the tray.

## Requirements

- [Bun](https://bun.sh) (workspace install)
- [Rust](https://rustup.rs/) + Xcode CLI tools (macOS)

## Development

From the repo root:

```bash
bun install
```

Use the same env as `apps/memories` (e.g. `MEMORIES_DB_PATH` in `apps/memories/.env`). The dev server is started with `cwd` in `apps/memories` so Bun loads that `.env`.

```bash
cd apps/memories-desktop
bun run dev
```

This runs the memories server on port **31416** and opens the Tauri window.

## Production build

Compiles the memories server into a sidecar binary, then builds the app:

```bash
cd apps/memories-desktop
bun run build
```

For an installed `.app`, copy your `.env` into **`~/Library/Application Support/com.cfd.memories.desktop/`** (or set vars in the parent environment) so the sidecar can load `MEMORIES_DB_PATH` and API keys. The sidecar process uses that directory as its working directory for Bun’s `.env` lookup.

## Scripts

| Script              | Purpose                                      |
| ------------------- | -------------------------------------------- |
| `bun run dev`       | `tauri dev` (Bun server + desktop shell)     |
| `bun run build`     | `tauri build` (sidecar compile + bundle)     |
| `bun run compile-sidecar` | Only rebuild the Bun `memories-server-*` binary |
