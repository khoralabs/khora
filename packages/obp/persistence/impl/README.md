# OBP v2 — persistence implementations

`ObpPersistenceStrategy` (adapter interface) and `ObpPersistenceClient` (strategy-pattern client) for the `khora.obp` persistence surface.

- **`ts/`** — [`@khoralabs/obp-persistence`](ts/package.json). Smithy source of truth: [`../spec`](../spec).

Swap backends by passing a different `ObpPersistenceStrategy` to `ObpPersistenceClient`.
