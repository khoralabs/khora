# @khoralabs/colonnade-persistence-sqlite

SQLite backend for [Colonnade](../README.md): encrypted local cell files, optional Bun Workers per cell, and catalog SQLite strategies.

## Usage

```ts
import { ColonnadePublicationClient } from "@khoralabs/colonnade-persistence";
import { createSqliteColonnadeCluster } from "@khoralabs/colonnade-persistence-sqlite";

const cluster = createSqliteColonnadeCluster({
  cellsDirectory: "/data/cells",
  mode: { kind: "pool", cellCount: 16 },
  encryption: { sqlCipherKey, outboxPayloadCodec, outboxKeyHex },
});

const pub = new ColonnadePublicationClient(cluster.resolveCell);
```

## Tests

```bash
cd packages/colonnade/impl/sqlite && bun test
```
