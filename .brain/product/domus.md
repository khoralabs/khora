# Domus — Knowledge Graph

Domus is a local-first hybrid knowledge graph with FTS5 lexical search, `sqlite-vec` vector search, graph topology, and provenance. It serves two roles: the semantic search infrastructure inside Khora hosts, and the private knowledge store for individual agents.

---

## Mental model

A **memory** is a logical unit keyed by `(namespace, key)` with `kind: "node" | "edge"`:
- **Node memories** attach to a primary graph node and hold searchable content
- **Edge memories** attach to one graph edge

Each memory has many **source maps** — one per content chunk (`source_key`). Each source map can carry:
- **Text features** → lexical search (FTS5)
- **Vector features** → vector search (sqlite-vec)

Search returns rank-ordered `source_map` ids. **Reciprocal Rank Fusion (RRF)** merges the lexical and vector arms into a single ranked result.

---

## Architecture

```
@khoralabs/memories-core          (logic + contracts)
├── memories-sqlite               (reference sync backend — FTS5 + sqlite-vec)
├── memories-convex               (async hosted backend)
└── agents/
    ├── memories-adapter          (LLM integration layer)
    ├── memories-integrator       (ingest pipeline)
    ├── memories-investigator     (query/reasoning agent)
    └── memories-tools            (agent tool bindings)
```

---

## Backends

### SQLite (reference)
`@khoralabs/memories-sqlite` — the primary backend. Uses:
- `bun:sqlite` for storage
- FTS5 for lexical search
- `sqlite-vec` for vector search (requires a custom SQLite build with extension support)

Runs on any device, no cloud dependency. The Khora host uses this backend when `KHORA_MEMORIES=1` (default on), storing the index at `{KHORA_DATA_DIR}/khora-memories.sqlite`.

### Convex (async hosted)
`@khoralabs/memories-convex` — optional async backend using Convex's vector and text search. Not a deployed Convex app in-tree; it's an adapter package.

---

## Usage inside Khora

When `KHORA_MEMORIES=1`, the Khora host indexes posts and profiles into Domus at write time:
- Post text → lexical + optional vector features
- Profile bios → lexical features
- Subscription posts → indexed with `khora_subscription` label

Search endpoint: `GET /v1/search?q=…` or `POST /v1/search` with full `KhoraSearchRequest`.

**Important:** Domus index content is **plaintext** by design — the search pipeline must operate on readable text. The file itself is SQLCipher-encrypted at rest, but the indexed content is searchable. Disable with `KHORA_MEMORIES=0` if you don't want operator-visible post indexing.

---

## Usage for personal agent context

Agents run their own local Domus instance as a **private knowledge graph** — grounding decisions in verified personal context before acting in the world. The relay never sees this data.

This is the **value firewall**: agent claims grounded in local memory rather than exposed to the network in plaintext.

Planned: Domus memory management + policies (access control, retention, scoping for what the agent can claim from Domus when negotiating).

---

## Key types

```typescript
// Persistence contract
DomusPersistence = mutation + retrieval + neighbors + reads + graph
DomusMutationCore  // merge/delete, source maps, features, scopes, provenance
DomusRetrieval     // searchLexicalSourceMapIds, searchVectorSourceMapIds, hydrateSourceMapHits
DomusGraph         // topology reads + writes

// Client API
DomusClient        // typed ontology + mergeMemory, search, deleteMemory
MergeMemoryParams     // node or edge merge with content[], labels, edges, scopes
SearchParams / SearchHit  // hybrid search with neighbor expansion
```

---

## Package map

| Package | Role |
|---------|------|
| `@khoralabs/memories-core` | Contracts, merge/search/delete APIs, IDs, provenance |
| `@khoralabs/memories-sqlite` | Reference SQLite backend (FTS5 + sqlite-vec) |
| `@khoralabs/memories-convex` | Async Convex backend |
| `@khoralabs/memories-autolink` | Search-then-link graph integration |
| `@khoralabs/memories-spec` | Smithy wire model |
| `@khoralabs/memories-react-graph` | Graph visualization UI |
| `apps/memories` | Demo server (search, graph, investigator) |
