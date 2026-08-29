# Percolator

Standing-query matching engine with pluggable persistence (in-memory, Bun SQLite, Turso).

| Export | Path | Role |
|--------|------|------|
| `@khoralabs/percolator` | [`src/core`](src/core) | **Product API** — engine, types, filters, scoring |
| `@khoralabs/percolator/persistence` | [`src/persistence/core`](src/persistence/core) | Storage port + in-memory fake |
| `@khoralabs/percolator/sqlite` | [`src/persistence/sqlite`](src/persistence/sqlite) | Bun SQLite adapter |
| `@khoralabs/percolator/turso-serverless` | [`src/persistence/turso-serverless`](src/persistence/turso-serverless) | Turso Cloud adapter |
| `@khoralabs/percolator/testing` | [`src/persistence/testing`](src/persistence/testing) | Contract test helpers |

Shared SQL DDL under `src/persistence/core/schema/` is **internal** to the sqlite/turso backends (not a package export).

See [`src/persistence/IMPLEMENTORS.md`](src/persistence/IMPLEMENTORS.md) for the adapter contract.

```ts
import { createPercolator } from "@khoralabs/percolator";
import type { PercolatorPersistence } from "@khoralabs/percolator/persistence";
import { createPercolatorSqlitePersistence } from "@khoralabs/percolator/sqlite";
```

```bash
cd packages/khora/percolator && bun test && bun run typecheck
```
