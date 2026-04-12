$version: "2"

namespace cfd.memories

// --- Row / hit shapes (storage-agnostic, aligned with @cfd/memories-core db/rows + search) ---

structure MemoryRow {
    _id: String
    _ts_created: Long
    namespace: String
    key: String
}

structure SourceMapRow {
    _id: String
    _ts_created: Long
    memory_id: String
    source_key: String
}

structure EdgeRow {
    _id: String
    _ts_created: Long
    from_node_id: String
    to_node_id: String
    properties: Document
}

structure NodeRow {
    _id: String
    _ts_created: Long
    value: String
    properties: Document
}

structure HydratedSourceMapHit {
    _id: String
    _ts_created: Long
    memory_id: String
    source_key: String
    memory: MemoryRow
    /// Ontology node label kinds on the memory (opaque strings at this layer).
    labels: StringList
}

/// Neighbor row from **ListNeighborsForMemory** (no fused neighbor score).
structure HydratedNeighbor {
    _id: String
    _ts_created: Long
    namespace: String
    key: String
    labels: StringList
    edge: EdgeRow
    edgeLabelKind: String
}

list HydratedNeighborList {
    member: HydratedNeighbor
}

structure SearchNeighborHit {
    _id: String
    _ts_created: Long
    namespace: String
    key: String
    labels: StringList
    edge: EdgeRow
    /// Ontology edge label kind on the incident edge (opaque string).
    edgeLabelKind: String
    neighborScore: Double
    matchedSourceMapId: String
}

structure SearchHit {
    /// Source map row fields
    _id: String
    _ts_created: Long
    memory_id: String
    source_key: String
    score: Double
    memory: MemoryRow
    labels: StringList
    neighbors: SearchNeighborHitList
}

list SearchNeighborHitList {
    member: SearchNeighborHit
}

@documentation("""
Optional backend feature flags. Omitted keys default via core `resolveMemoriesBackendCapabilities`
(lexical, vector, neighbor, multi-namespace on; **unscopedSearch** off).

When a flag is false, the logic layer:
- **lexicalSearch:** skips lexical arm; text-only merge may still run if FTS is a no-op.
- **vectorSearch:** skips vector arm; rejects merge content items with vector; vector-only search returns [].
- **neighborIndex:** skips neighbor listing and expansion in search.
- **multiNamespaceSearch:** core runs separate per-namespace retrieval and merges with RRF (no `IN` list required).
- **unscopedSearch:** rejects `searchEntireDatabase` on SearchParams; unscoped scope is not used.

Thin single-namespace adapters should set **multiNamespaceSearch** false; core still works via fallback.
""")
structure MemoriesBackendCapabilities {
    /// When false, logic skips lexical arm.
    lexicalSearch: Boolean
    /// When false, logic rejects merge vectors and skips vector arm.
    vectorSearch: Boolean
    /// When false, search ignores neighbor listing and expansion.
    neighborIndex: Boolean
    /// When false, core runs separate per-namespace retrieval and merges with RRF.
    multiNamespaceSearch: Boolean
    /// When false, `searchEntireDatabase` on SearchParams is rejected.
    unscopedSearch: Boolean
}

/// Namespace predicate for hybrid retrieval.
union SearchNamespaceScope {
    unionNamespaces: NamespaceUnion
    unscoped: UnscopedScope
}

structure NamespaceUnion {
    /// Non-empty, deduped namespace list.
    namespaces: StringList
}

/// Marker member: no namespace predicate (entire DB).
structure UnscopedScope {}

// --- Public API: merge / search / delete ---

structure MergeMemoryContentItem {
    /// User content key; must not be reserved (`__` prefix or search-meta key).
    key: String
    text: String
    vector: DoubleList
}

list DoubleList {
    member: Double
}

structure MergeMemoryEdge {
    memory_key: String
    direction: EdgeDirection
    /// Encoded ontology edge label (opaque string on wire).
    label: String
    properties: Document
}

enum EdgeDirection {
    @enumValue("in")
    IN

    @enumValue("out")
    OUT
}

structure MergeMemoryParams {
    key: String
    namespace: String
    content: MergeMemoryContentItemList
    /// Encoded ontology node labels (opaque strings).
    labels: StringList
    properties: Document
    edges: MergeMemoryEdgeList
    /// Optional primary-memory search-meta vector (same dim as content vectors).
    searchMetaVector: DoubleList
}

list MergeMemoryContentItemList {
    member: MergeMemoryContentItem
}

list MergeMemoryEdgeList {
    member: MergeMemoryEdge
}

structure MergeMemoryOutput {
    /// Keys whose search-meta lexical row was rebuilt.
    invalidatedMetaKeys: StringList
}

structure DeleteMemoryParams {
    namespace: String
    key: String
}

structure DeleteMemoryOutput {}

structure SearchContent {
    text: String
    vector: DoubleList
}

structure LabelFilter {
    all: StringList
    some: StringList
}

structure NeighborNodesFilter {
    all: StringList
    some: StringList
}

structure NeighborConstraint {
    /// Edge label kind (opaque string).
    label: String
    direction: EdgeDirection
    nodes: NeighborNodesFilter
}

structure NeighborFilter {
    all: NeighborConstraintList
    some: NeighborConstraintList
}

list NeighborConstraintList {
    member: NeighborConstraint
}

union NeighborSearchOption {
    toggle: Boolean
    structured: NeighborFilter
}

structure SearchArms {
    vector: Double
    lexical: Double
}

structure SearchOptions {
    topK: Integer
    minScore: Double
    labels: LabelFilter
    neighbors: NeighborSearchOption
    maxNeighbors: Integer
    arms: SearchArms
}

structure SearchParams {
    namespace: String
    additionalNamespaces: StringList
    searchEntireDatabase: Boolean
    content: SearchContent
    options: SearchOptions
}

structure SearchOutput {
    hits: SearchHitList
}

list SearchHitList {
    member: SearchHit
}

list HydratedSourceMapHitList {
    member: HydratedSourceMapHit
}

list StringList {
    member: String
}

// --- Persistence: shared op context ---

structure MemoryOpContext {
    now: Long
}

structure GraphEdgeLink {
    edgeId: String
    fromKey: String
    toKey: String
    labels: StringList
}

structure GraphMemoryEmbedding {
    memoryKey: String
    memoryId: String
    embedding: DoubleList
}

structure EdgePreviewPayload {
    edgeId: String
    fromKey: String
    toKey: String
    labels: StringList
    properties: Document
}

structure InsertEdgeIdParts {
    selfMemoryKey: String
    otherMemoryKey: String
    label: String
}
