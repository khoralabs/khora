# `@khoralabs/vellum-contracts`

Zod-backed types and helpers shared by the Vellum **CLI**, **daemon**, and **`@khoralabs/vellum-client`**. Covers control-plane response shapes, domain rows (chains, offers, ports), path conventions (`cfgDataDir`, SQLite filenames), and constants such as default genesis turn wire.

Dependency-light: **`zod`** only. No Bun-specific APIs — safe to import anywhere in the workspace.

## Scripts

- `bun test` — schema/unit tests
- `bun run typecheck` — `tsc --noEmit`

Barrel: [`src/index.ts`](src/index.ts) re-exports [`control-wire.ts`](src/control-wire.ts), [`domain.ts`](src/domain.ts), [`paths.ts`](src/paths.ts).
