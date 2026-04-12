$version: "2"

namespace cfd.memories

@documentation("""
Storage implementor surface: mutation + hybrid retrieval + neighbor index.
Hosts expose optional **MemoriesBackendCapabilities** alongside these operations (not modeled as RPC).

**Transactions:** Prefer one outer transaction per merge/delete. Nesting depends on the driver.

**clearMemorySubtree** vs **DeleteMemoryRootRows:** subtree clear removes dependents while roots may remain until root delete. Delete is idempotent if already absent.

**Search-meta:** reserved `source_key` for hybrid meta chunk; **SyncMemorySearchMeta** rebuilds canonical text and optional vector.

**Label-props chunks (optional):** reserved `__mem_nl_props__*` / `__mem_edge_props__*` keys; **SyncLabelPropsSearchFeatures** runs after meta sync for invalidated keys when implemented.

**Async:** Mirror with Promise/async method signatures in language bindings.
""")
service MemoriesPersistenceService {
    version: "2026-04-11"
    operations: [
        WithTransaction
        ListNeighborMemoryKeysForNode
        ClearMemorySubtree
        UpsertMemory
        UpsertNodeForMemoryKey
        InsertSourceMap
        InsertTextFeatureWithFts
        InsertVectorFeatureWithVecIndex
        EnsureNodeLabel
        InsertNodeLabelAssignment
        FindMemoryIdByKey
        NodeExists
        InsertEdge
        EnsureEdgeLabel
        InsertEdgeLabelAssignment
        SyncMemorySearchMeta
        SyncLabelPropsSearchFeatures
        BuildCanonicalMemorySearchMetaText
        UpsertMemorySearchMetaVector
        DeleteMemoryRootRows
        SearchLexicalSourceMapIds
        SearchVectorSourceMapIds
        HydrateSourceMapHits
        ListNeighborsForMemory
    ]
}

@documentation("""
Host-native: run callback body in one ACID transaction; commit on success, rollback on error.
Not a serializable wire operation in v1.

In-process adapters implement this with their driver’s transaction primitive.
""")
operation WithTransaction {
    input: WithTransactionInput
    output: WithTransactionOutput
}

structure WithTransactionInput {}

structure WithTransactionOutput {
    committed: Boolean
}

operation ListNeighborMemoryKeysForNode {
    input: ListNeighborMemoryKeysForNodeInput
    output: ListNeighborMemoryKeysForNodeOutput
}

structure ListNeighborMemoryKeysForNodeInput {
    op: MemoryOpContext
    namespace: String
    nodeId: String
}

structure ListNeighborMemoryKeysForNodeOutput {
    keys: StringList
}

operation ClearMemorySubtree {
    input: ClearMemorySubtreeInput
    output: ClearMemorySubtreeOutput
}

structure ClearMemorySubtreeInput {
    op: MemoryOpContext
    memoryId: String
    nodeId: String
}

structure ClearMemorySubtreeOutput {}

operation UpsertMemory {
    input: UpsertMemoryInput
    output: UpsertMemoryOutput
}

structure UpsertMemoryInput {
    op: MemoryOpContext
    namespace: String
    key: String
}

structure UpsertMemoryOutput {
    memoryId: String
    _ts_created: Long
}

operation UpsertNodeForMemoryKey {
    input: UpsertNodeForMemoryKeyInput
    output: UpsertNodeForMemoryKeyOutput
}

structure UpsertNodeForMemoryKeyInput {
    op: MemoryOpContext
    namespace: String
    memoryKey: String
    properties: Document
}

structure UpsertNodeForMemoryKeyOutput {
    nodeId: String
}

operation InsertSourceMap {
    input: InsertSourceMapInput
    output: InsertSourceMapOutput
}

structure InsertSourceMapInput {
    op: MemoryOpContext
    memoryId: String
    sourceKey: String
}

structure InsertSourceMapOutput {
    sourceMapId: String
}

operation InsertTextFeatureWithFts {
    input: InsertTextFeatureWithFtsInput
    output: InsertTextFeatureWithFtsOutput
}

structure InsertTextFeatureWithFtsInput {
    op: MemoryOpContext
    memoryId: String
    sourceMapId: String
    text: String
}

structure InsertTextFeatureWithFtsOutput {
    textFeatureId: String
}

operation InsertVectorFeatureWithVecIndex {
    input: InsertVectorFeatureWithVecIndexInput
    output: InsertVectorFeatureWithVecIndexOutput
}

structure InsertVectorFeatureWithVecIndexInput {
    op: MemoryOpContext
    memoryId: String
    sourceMapId: String
    vector: DoubleList
}

structure InsertVectorFeatureWithVecIndexOutput {
    vectorFeatureId: String
}

operation EnsureNodeLabel {
    input: EnsureNodeLabelInput
    output: EnsureNodeLabelOutput
}

structure EnsureNodeLabelInput {
    op: MemoryOpContext
    value: String
}

structure EnsureNodeLabelOutput {
    labelId: String
}

operation InsertNodeLabelAssignment {
    input: InsertNodeLabelAssignmentInput
    output: InsertNodeLabelAssignmentOutput
}

structure InsertNodeLabelAssignmentInput {
    op: MemoryOpContext
    nodeId: String
    labelId: String
}

structure InsertNodeLabelAssignmentOutput {}

operation FindMemoryIdByKey {
    input: FindMemoryIdByKeyInput
    output: FindMemoryIdByKeyOutput
}

structure FindMemoryIdByKeyInput {
    namespace: String
    key: String
}

structure FindMemoryIdByKeyOutput {
    memoryId: String
}

operation NodeExists {
    input: NodeExistsInput
    output: NodeExistsOutput
}

structure NodeExistsInput {
    nodeId: String
}

structure NodeExistsOutput {
    exists: Boolean
}

operation InsertEdge {
    input: InsertEdgeInput
    output: InsertEdgeOutput
}

structure InsertEdgeInput {
    op: MemoryOpContext
    fromNodeId: String
    toNodeId: String
    properties: Document
    idParts: InsertEdgeIdParts
}

structure InsertEdgeOutput {
    edgeId: String
}

operation EnsureEdgeLabel {
    input: EnsureEdgeLabelInput
    output: EnsureEdgeLabelOutput
}

structure EnsureEdgeLabelInput {
    op: MemoryOpContext
    value: String
}

structure EnsureEdgeLabelOutput {
    labelId: String
}

operation InsertEdgeLabelAssignment {
    input: InsertEdgeLabelAssignmentInput
    output: InsertEdgeLabelAssignmentOutput
}

structure InsertEdgeLabelAssignmentInput {
    op: MemoryOpContext
    edgeId: String
    labelId: String
}

structure InsertEdgeLabelAssignmentOutput {}

operation SyncMemorySearchMeta {
    input: SyncMemorySearchMetaInput
    output: SyncMemorySearchMetaOutput
}

structure SyncMemorySearchMetaInput {
    op: MemoryOpContext
    namespace: String
    memoryKey: String
    metaVector: DoubleList
}

structure SyncMemorySearchMetaOutput {}

@documentation("""
Optional on implementors (omit on backends that only support topology meta).

Remove prior label-props source_map rows for the memory, then insert fresh FTS from ontology props.
""")
operation SyncLabelPropsSearchFeatures {
    input: SyncLabelPropsSearchFeaturesInput
    output: SyncLabelPropsSearchFeaturesOutput
}

structure SyncLabelPropsSearchFeaturesInput {
    op: MemoryOpContext
    namespace: String
    memoryKey: String
}

structure SyncLabelPropsSearchFeaturesOutput {}

operation BuildCanonicalMemorySearchMetaText {
    input: BuildCanonicalMemorySearchMetaTextInput
    output: BuildCanonicalMemorySearchMetaTextOutput
}

structure BuildCanonicalMemorySearchMetaTextInput {
    op: MemoryOpContext
    namespace: String
    memoryKey: String
}

structure BuildCanonicalMemorySearchMetaTextOutput {
    text: String
}

operation UpsertMemorySearchMetaVector {
    input: UpsertMemorySearchMetaVectorInput
    output: UpsertMemorySearchMetaVectorOutput
}

structure UpsertMemorySearchMetaVectorInput {
    op: MemoryOpContext
    namespace: String
    memoryKey: String
    vector: DoubleList
}

structure UpsertMemorySearchMetaVectorOutput {}

operation DeleteMemoryRootRows {
    input: DeleteMemoryRootRowsInput
    output: DeleteMemoryRootRowsOutput
}

structure DeleteMemoryRootRowsInput {
    memoryId: String
    nodeId: String
}

structure DeleteMemoryRootRowsOutput {}

@documentation("Returns rank-ordered source_map ids (best first); RRF consumes rank only, not scores.")
operation SearchLexicalSourceMapIds {
    input: SearchLexicalSourceMapIdsInput
    output: SearchLexicalSourceMapIdsOutput
}

structure SearchLexicalSourceMapIdsInput {
    scope: SearchNamespaceScope
    text: String
    limit: Integer
    memoryIds: StringList
}

structure SearchLexicalSourceMapIdsOutput {
    sourceMapIds: StringList
}

@documentation("Returns rank-ordered source_map ids (best first).")
operation SearchVectorSourceMapIds {
    input: SearchVectorSourceMapIdsInput
    output: SearchVectorSourceMapIdsOutput
}

structure SearchVectorSourceMapIdsInput {
    scope: SearchNamespaceScope
    vector: DoubleList
    limit: Integer
    memoryIds: StringList
}

structure SearchVectorSourceMapIdsOutput {
    sourceMapIds: StringList
}

operation HydrateSourceMapHits {
    input: HydrateSourceMapHitsInput
    output: HydrateSourceMapHitsOutput
}

structure HydrateSourceMapHitsInput {
    sourceMapIds: StringList
}

structure HydrateSourceMapHitsOutput {
    hits: HydratedSourceMapHitList
}

operation ListNeighborsForMemory {
    input: ListNeighborsForMemoryInput
    output: ListNeighborsForMemoryOutput
}

structure ListNeighborsForMemoryInput {
    namespace: String
    key: String
    filters: NeighborFilter
}

structure ListNeighborsForMemoryOutput {
    neighbors: HydratedNeighborList
}
