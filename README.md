# agent-kernel

To install dependencies:

```bash
git submodule update --init --recursive
bun install
```

[Husky](https://typicode.github.io/husky/) runs **Biome** format/lint on `git push` (see `.husky/pre-push`). Fix issues locally with `bun run format`, or check without writing via `bun run format:check`.

To run:

```bash
bun run index.ts
```

**Tests:** `bun test` at the repo root runs workspace packages and preloads SQLite setup (`bunfig.toml`) so extension-capable `libsqlite3` is chosen before other tests open `bun:sqlite`. Tests that use `@khoralabs/memories-sqlite` still need a suitable SQLite build for sqlite-vec (often Homebrew SQLite on macOS). Use `bun run test:with-sqlite` when Homebrew `sqlite` is installed but `brew` is not on `PATH`, or set `SQLITE_CUSTOM_LIB` — see [`packages/memories/packages/persistence/sqlite/README.md`](packages/memories/packages/persistence/sqlite/README.md#running-tests-sqlite-vec--extension-loading).

This project was created using `bun init` in bun v1.3.4. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
