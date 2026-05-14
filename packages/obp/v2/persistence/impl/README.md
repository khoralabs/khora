# OBP v2 — persistence implementations

`ObpPersistenceStrategy` (adapter interface) and `ObpPersistenceClient` (strategy-pattern client) for the `cfd.obp` persistence surface.

- **`ts/`** — [`@khoralabs/obp-v2-persistence`](ts/package.json). Smithy source of truth: [`../spec`](../spec).

Swap backends by passing a different `ObpPersistenceStrategy` to `ObpPersistenceClient`.
