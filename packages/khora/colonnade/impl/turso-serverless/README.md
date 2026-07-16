# @khoralabs/colonnade-persistence-turso-serverless

Turso Cloud backend for [Colonnade](../README.md): one remote Turso database per cell shard via URL templates.

## Usage

```ts
import { ColonnadePublicationClient } from "@khoralabs/colonnade-persistence";
import { createTursoColonnadeCluster } from "@khoralabs/colonnade-persistence-turso-serverless";

const cluster = await createTursoColonnadeCluster({
  cells: {
    urlTemplate: "libsql://colonnade-{shardIndex}.my-org.turso.io",
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
  mode: { kind: "pool", cellCount: 16 },
  encryption: { outboxPayloadCodec },
});

const pub = new ColonnadePublicationClient(cluster.catalog, cluster.resolveCell);
await cluster.close();
```

### URL template placeholders

| Placeholder | Value |
|-------------|-------|
| `{cellId}` | Full logical id (`colonnade-shard-0`, `colonnade-p-{hex}`) |
| `{shardIndex}` / `{shard}` | Numeric shard from `colonnade-shard-{N}` |

Pool count is validated via `cell_meta.cell_pool_count` on each Turso cell database (remote equivalent of `.colonnade-pool.json`).

## Integration tests

```bash
export TURSO_DATABASE_URL="libsql://..."
export TURSO_AUTH_TOKEN="..."
cd packages/colonnade/impl/turso-serverless && bun test
```

## Limitations

- Nested transactions are rejected
- No worker isolation (network latency applies)
- Field-level outbox encryption uses `OutboxPayloadCodec`; optional Turso `remoteEncryptionKey` for at-rest encryption
