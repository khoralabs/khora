# @khoralabs/percolator-turso-serverless

Turso serverless persistence for standing percolator queries (catalog DB).

Mirrors `@khoralabs/percolator-sqlite` against `@tursodatabase/serverless` HTTP/libsql connections.

## Usage

```ts
import { createTursoClients, createPercolatorTursoPersistence } from "@khoralabs/percolator-turso-serverless";
import { bootstrapKhoraPercolator } from "@khoralabs/khora-host";

const clients = createTursoClients({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const persistence = await createPercolatorTursoPersistence(clients);
const { percolator } = bootstrapKhoraPercolator({ persistence, embeddingModel });
```

## Tests

```sh
bun test
```

Live Turso integration tests run when `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are set.
