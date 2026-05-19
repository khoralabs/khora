# ADR: Semantic search indexes and account deletion

Atrium / Atrium hosts today persist social data in SQLite (full Atrium host) or Colonnade `source_map_rows` (v2 relay). **Account unregister** and **post delete** run eager deletes for the principal's canonical rows; cell inbox pointers are discarded at drain time or purged on principal teardown. Lazy reconcile when a pointer is read still applies to post fan-out delivery.

If a deployment adds **BM25**, **vector**, or other **query-only** indexes, those stores must subscribe to the same **principal teardown** and **per-post delete** hooks (or run equivalent async reindex / tombstone jobs). **Lazy pointer reconciliation**—deleting a catalog row only when something tries to resolve it—is **not** sufficient for indexes that are never traversed through the pointer path.
