# Colonnade

**Colonnade** specifies a federated persistence architecture: a **central catalog** for discovery and selective indexing, **cells** (sharded stores) each with an authoritative **outbox** and a **drainable inbox**, plus a **router** that feeds **per-cell write logs** for serialized writers.

This package holds the **Smithy model** (`spec/model/`) and a **TypeScript persistence facade** (`impl/ts/`) with strategy-pattern adapters. It is **storage-agnostic** at the spec level (no SQLite DDL in Smithy). SQLite (or other) backends can implement the TS strategies later.

## TypeScript implementation

[`impl/ts`](impl/ts) defines **`@khoralabs/colonnade-persistence`**: `CatalogPersistenceStrategy`, `CellPersistenceStrategy`, `ColonnadeRouter`, `ColonnadePublicationClient`, plus in-memory strategies for tests.

```bash
cd packages/colonnade/impl/ts && bun test && bun run typecheck
```

### Benchmarks

Micro-benchmarks exercise publication, routing, and inbox drain paths against injectable persistence factories (`BenchmarkStrategies` in [`impl/ts/src/bench/strategies.ts`](impl/ts/src/bench/strategies.ts)). Built-ins: **`default`** (in-memory) and **`sqlite`** (temp catalog + cell DBs per run). Use **`registerBenchmarkStrategies`** for custom backends.

Canonical defaults (SQLite, **`post_catalog_fanout`**, 3000 iterations / 200 warmup, etc.) live in [`impl/ts/src/bench/bench-defaults.ts`](impl/ts/src/bench/bench-defaults.ts). With no flags, **`bun run bench`** uses those defaults.

```bash
cd packages/colonnade/impl/ts && bun run bench
cd packages/colonnade/impl/ts && bun run bench -- --json
cd packages/colonnade/impl/ts && bun run bench:sweep-json -- -o sweep.json
```

`--json` prints an object with a **`config`** field (the resolved CLI args) plus the usual result metrics. See the header comment in [`impl/ts/src/bench/run.ts`](impl/ts/src/bench/run.ts) for flags and interpreting throughput vs per-op latency.

## Spec layout

| Path | Role |
| --- | --- |
| [`spec/model/shapes.smithy`](spec/model/shapes.smithy) | Shared identifiers, content hashes, pointer/inbox unions |
| [`spec/model/catalog.smithy`](spec/model/catalog.smithy) | `CatalogIndex` — discovery metadata, percolation predicates, pointers, source-map row upserts |
| [`spec/model/catalog-read.smithy`](spec/model/catalog-read.smithy) | `CatalogRead` — fan-out resolution, source-map pointer lookups, canonical row hashing |
| [`spec/model/cell.smithy`](spec/model/cell.smithy) | `CellStore` — outbox append, inbox enqueue/drain/resolve |
| [`spec/model/routing.smithy`](spec/model/routing.smithy) | `ColonnadeRouter`, `CellWriteLog` — routed writes and queues |
| [`spec/model/post.smithy`](spec/model/post.smithy) | `PostOperation` — publication orchestration (catalog vs fan-out) |

## Validation

With [Smithy CLI](https://smithy.io/2.0/guides/cli-model-validation.html) installed:

```bash
smithy validate packages/colonnade/spec/model
```

(Exact CLI invocation depends on whether you use a `smithy-build.json`; this repo often validates models ad hoc.)

## Narrative source

Architecture prose and security goals also appear in [`packages/colonnade/.idea/spec.md`](.idea/spec.md). The Smithy files are the normative API-oriented view.
