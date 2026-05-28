# Principal lifecycle

Khora principal unregister and inbox post-pointer deliverability are owned by **`RelayPrincipalLifecycle`** in `@khoralabs/relay-colonnade`.

```ts
const lifecycle = createRelayPrincipalLifecycle({ catalogDb, framesDb, projectionStore, ... });

lifecycle.enqueueTeardown(did);              // phase 1: drop registration, enqueue job
lifecycle.isPostPointerDeliverable(did);   // read-path gate for inbox drain
await lifecycle.runNextTeardownJob();        // phase 2: graph purge + cell purgePrincipal
lifecycle.cascadeTeardownNow(did);           // eager teardown (tests / admin)
```

Host wiring: one lifecycle instance on [`KhoraHostContext`](../packages/khora/host/src/context.ts), shared by catalog unregister, inbox drain, and the background worker.

## Flow

```mermaid
sequenceDiagram
  participant Client
  participant Host as khora-host
  participant Lifecycle as RelayPrincipalLifecycle
  participant Catalog as catalog SQLite
  participant Drain as relay-inbox-drain
  participant Worker as teardown worker
  participant Cell as cell SQLite

  Client->>Host: unregister
  Host->>Lifecycle: enqueueTeardown(did)
  Lifecycle->>Catalog: delete registration rows
  Lifecycle->>Catalog: insert principal_teardown_jobs pending

  Note over Drain: Later: WS inbox drain
  Drain->>Lifecycle: isPostPointerDeliverable(authorDid)
  alt author unregistered or teardown active
    Drain->>Cell: discard inbox entry
  else deliverable
    Drain->>Cell: resolve pointer, verify, drain
  end

  Worker->>Lifecycle: runNextTeardownJob()
  Lifecycle->>Catalog: claim pending job
  Lifecycle->>Catalog: cascade subscriptions/social/projections
  Lifecycle->>Cell: purgePrincipal(home cell)
  Lifecycle->>Catalog: delete job row
```

## Policy tiers

| Tier | Where | Rule |
|------|-------|------|
| **Lifecycle policy** | `RelayPrincipalLifecycle.isPostPointerDeliverable` | Author registered AND no active teardown job |
| **Storage verification** | `relay-inbox-drain.ts` | `OutboxGhostError`, hash mismatch, pool mismatch → discard row |

Lifecycle policy runs **before** pointer resolution. Storage verification runs **during** resolution.

## Job queue

Durable jobs live in `principal_teardown_jobs` on the relay catalog DB. Schema is ensured by `ensurePrincipalTeardownJobsSchema` at catalog open. Job CRUD is internal to the lifecycle module — not exported from `@khoralabs/relay-colonnade`.

## Extension

Grace periods, soft-delete authors, or delayed cell purge: add rules only to `RelayPrincipalLifecycle` (especially `isPostPointerDeliverable` and `runNextTeardownJob`). Colonnade `purgePrincipal` stays a generic storage primitive.

See also [`colonnade-usage.md`](../packages/khora/host/colonnade-usage.md) Tier 3 and [`system.md`](system.md).
