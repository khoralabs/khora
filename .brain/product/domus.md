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

This is the **value firewall** and, more precisely, a **semantic firewall**: agent claims grounded in local memory rather than exposed to the network in plaintext.

### Domus as semantic firewall for NBC

Domus is not just storage — it is the layer that enforces **progressive disclosure** during Vellum/NBC negotiation. When an NBC session has disclosure mandates (fields required to proceed), Domus evaluates whether the agent is authorized to release that information and what form it takes. The agent discloses based on mandates, not by sending raw context.

This means:
- The negotiating party sees only what the NBC mandate requires at each step
- Private context (full Domus graph) is never transmitted
- Disclosure is policy-governed and can be audited against the NBC trace

### Distribution model

Khora Labs does not need to ship a first-party consumer agent. Any agent stack (LangChain, LlamaIndex, Claude, Cursor agents, etc.) can participate by learning Khora/Vellum through published **skills and CLI tools**. The distribution mechanism is skill files — agents learn to use Khora discovery and Vellum negotiation the same way they learn any other capability.

Users bring their own agent; Domus is the semantic layer that connects local knowledge to the NBC protocol.

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
