# agent-kernel

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

**Tests:** `bun test` at the repo root runs workspace packages and preloads SQLite setup (`bunfig.toml`) so extension-capable `libsqlite3` is chosen before other tests open `bun:sqlite`. Tests that use `@cfd/memories-sqlite` still need a suitable SQLite build for sqlite-vec (often Homebrew SQLite on macOS). Use `bun run test:with-sqlite` when Homebrew `sqlite` is installed but `brew` is not on `PATH`, or set `SQLITE_CUSTOM_LIB` — see [`packages/memories/persistence/sqlite/README.md`](packages/memories/persistence/sqlite/README.md#running-tests-sqlite-vec--extension-loading).

This project was created using `bun init` in bun v1.3.4. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
