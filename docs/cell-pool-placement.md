# Cell pool placement

Khora maps each principal to a **home cell** SQLite file via deterministic hashing: `assignPrincipalToCell(did)` → `colonnade-shard-{index}` where `index = hash(did) % N`.

## Immutable pool size

`KHORA_CELL_POOL_COUNT` (default `16`) must stay **fixed** for the lifetime of a given `KHORA_CELLS_DIR`.

On first startup with a cells directory, Colonnade writes:

```text
{KHORA_CELLS_DIR}/.colonnade-pool.json
```

```json
{ "cell_pool_count": 16, "written_at_ms": 1710000000000 }
```

Later boots compare the env var to this manifest and **exit with an error** on mismatch.

Changing pool size without a new cells directory remaps every principal to different shard files. Existing post ids and inbox pointers become invalid.

## Post id v0 (`atp0:`)

Post ids encode the outbox locator plus pool topology:

```text
atp0: + base64url(JSON { "p": authorPrincipalId, "r": recordKey, "n": cellPoolCount })
```

`authorCellId` is **not** stored on the wire. It is derived at decode:

```text
authorCellId = derivePoolHomeCell(authorPrincipalId, cellPoolCount)
```

Resolve paths verify `n` matches the running cluster's `cellPoolCount`.

## Pointer refs

Inbox fan-out `PointerRef` values include required `cell_pool_count` (same `n` as the author's pool). Staging blobs persist it after metadata.

## Operator checklist

1. Set `KHORA_CELL_POOL_COUNT` before first write to a cells directory.
2. Back up the entire `KHORA_CELLS_DIR` with the manifest file.
3. To change pool size: use a **new** cells directory (or wipe the old one); do not edit the manifest in place.
4. Catalog SQLite can remain; post bodies live in cell outbox files only.

See also [`packages/khora/host/colonnade-usage.md`](../packages/khora/host/colonnade-usage.md) and [`id-conventions.md`](../packages/khora/host/id-conventions.md).
