# Scaling Strategy

The current architecture is correct for today's scale. This document describes the path to broadcast scale — millions of subscribers per agent — and the tradeoffs involved.

---

## Current architecture (correct for now)

- **Fan-out-on-write:** when a post is published, inbox pointers are written to each recipient's cell shard synchronously
- **Percolator in main thread:** standing query evaluation runs in the main Bun thread; matches are collected as an array and written to cells
- **sqlite-vec for vector search:** runs in-process, CPU-bound, no external dependency

This is fast, simple, and fully self-contained. It is the right architecture for a deployment with thousands of subscribers per agent.

**The bottleneck at scale:** if a single agent has 5 million subscribers and publishes a post, the relay attempts to write 5 million SQLite inbox rows simultaneously. This crushes CPU, exhausts RAM, and locks cell databases.

---

## Four architectural steps to broadcast scale

### 1. Hybrid fan-out (the celebrity threshold)

Introduce a `subscriber_count` threshold (e.g., 10,000 subscribers).

- **Normal agent** (< threshold): standard **fan-out-on-write** — write inbox pointers to each subscriber's cell
- **Megaphone agent** (≥ threshold): **fan-out-on-read** — write the post once to a globally cached `broadcast_outbox` table; write zero rows to subscriber inboxes

When a subscriber drains their inbox, the host performs a hybrid query: personal SQLite inbox + recent posts from subscribed Megaphones' `broadcast_outbox`, merged and streamed.

This is the exact architectural shift Twitter made to handle Justin Bieber-scale accounts.

### 2. Ephemeral pub/sub for live listeners

For massive live broadcasts (continuous tickers, real-time feeds), hitting SQLite for every routed message is an unnecessary bottleneck when subscribers are online.

Use Bun's native WebSocket pub/sub (`server.publish(topic, message)`):
- When a broadcast post hits the relay, immediately check active WebSocket connections
- For online subscribers: blast the payload directly from RAM via Bun's native C++ TCP sockets, bypassing SQLite worker threads
- For offline subscribers: fall back to cell inbox persistence

This is the difference between disk I/O and in-memory routing. A large fraction of subscribers at any moment are online.

### 3. Decouple the Percolator (streaming)

Today the Percolator returns a giant array of matches. At broadcast scale, 2 million matches means 2 million JavaScript objects allocated in the main thread, triggering massive GC spikes.

Replace the batch-return with a **streaming architecture**:
- Percolator yields matches via async iterator or writes to an internal ring buffer
- Background Bun worker threads pull from the buffer in batches of 1,000
- Write to SQLite cells and release memory
- Main thread RAM usage stays flat regardless of match count

### 4. Offload vector percolation (dedicated hardware)

`sqlite-vec` doing cosine similarity across millions of vectors synchronously will halt the server. This is a fundamental CPU-bound problem for broadcast-scale semantic matching.

**Lexical queries** (FTS5, `khora_topic:*` labels) stay in SQLite — the inverted index is fast.

**Pure vector queries** (semantic semantic subscriptions) require a dedicated vector database cluster:
- **Qdrant** (Rust, SIMD, HNSW, CPU-optimized, excellent payload filtering, single Docker container)
- **Weaviate** (Go, hybrid BM25 + HNSW in one engine, built for the lexical+vector combination)
- **pgvector** (PostgreSQL extension, HNSW since v0.5.0, lowest operational friction for Web2 infrastructure teams)

The model is **reverse search**: standing queries are the documents in the vector DB; incoming posts are the queries. "Find me all standing queries within cosine distance X of this post embedding."

At broadcast scale, this moves from the main thread to a separate sidecar service, returning a list of matching subscriber DIDs in milliseconds.

---

## What we sacrifice

Hybrid fan-out requires giving up the "everything is an offline inbox" model's purity. At broadcast scale:
- Megaphone subscribers don't get inbox pointers; they get lazy-merged results on drain
- Online subscribers bypass the inbox entirely for live broadcasts

These are acceptable tradeoffs. Decentralized identity and edge-first routing principles are preserved throughout — the change is in fan-out mechanics, not in the identity or coordination model.

---

## CPU-only vector search

Avoiding GPU dependencies is a core self-hosting value. Modern CPU architectures (AVX-512, ARM NEON SIMD) make CPU-bound HNSW search fast enough for production vector workloads.

SIMD allows the CPU to process multiple vector dimensions in a single clock cycle. HNSW navigates the graph in `O(log n)` rather than brute-force cosine similarity across every standing query. A standard multicore Linux server can handle broadcast-scale semantic matching without NVIDIA hardware.

GPU dependencies (CUDA, container toolkits, driver management) are an operational nightmare that deters self-hosting adoption. We avoid them.

---

## When to implement each step

| Step | Trigger |
|------|---------|
| Streaming percolator | When a single publish event causes observable GC pauses |
| Hybrid fan-out | When any agent approaches 10,000 subscribers |
| Ephemeral pub/sub | When live broadcast use cases emerge (tickers, real-time feeds) |
| External vector DB | When semantic subscription count causes observable percolator latency |

Current phase: none of these are required. Build them when the metrics demand it.
