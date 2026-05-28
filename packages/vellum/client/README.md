# `@khoralabs/vellum-client`

Library API used by **`apps/vellum/cli`**: load agent identity, attach to an Khora **room** (`KhoraClient`), call the local **Vellum daemon** control plane over `@khoralabs/vellum-transport`, and read NBC graph state from room-scoped SQLite (`SqliteVellumReadModel` / `VellumReadModel`).

Validates bind payloads via **`@khoralabs/vellum-bind-policy`** before sending turns that reference ports.

## Scripts

- `bun run typecheck` — `tsc --noEmit`

Entry: [`src/index.ts`](src/index.ts) exports `VellumClient`, control transport re-exports, SQLite read model, and `listLocalVellumRows`.
