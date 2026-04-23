$version: "2"

namespace cfd.agent_identity

// --- Lists ---

list StringList {
    member: String
}

list ToolRefRowList {
    member: ToolRefRow
}

list ToolKeyHashPairList {
    member: ToolKeyHashPair
}

list InstructionLineList {
    member: String
}

list PolicyIdList {
    member: String
}

list IdentityLinkFieldList {
    member: IdentityLinkField
}

list IdentityLinkFieldChangeList {
    member: IdentityLinkFieldChange
}

list HashChangeList {
    member: ToolRefHashChange
}

// --- Wire snapshots (no handlers; aligned with @cfd/agent-identity) ---

/// Serializable tool shape for hashing and interchange (handler omitted).
structure ToolSpecWire {
    name: String
    description: String
    /// Single string; canonical split for hashing uses `\\n\\n` in TS `toolSpecCanonicalPayload`.
    instructions: String
    /// JSON Schema or vendor stub from `schemaToHashInput` (Standard Schema).
    inputSchema: Document
    /// Sorted policy ids for runtime hashing parity with static tool hash.
    policyIds: PolicyIdList
}

/// Agent snapshot without composable tree (see `RegisteredAgentIdentity` in TS).
structure RegisteredAgentIdentityWire {
    agentId: String
    name: String
    staticHash: String
    staticInstructions: StringList
    staticContext: Document
}

// --- Canonical payloads (pre-hash JSON trees; `hashPlainObject` in TS) ---

structure RuntimeIdentityCanonicalPayload {
    /// Always `"runtime"` in TS.
    kind: String
    tools: ToolKeyHashPairList
}

structure ToolKeyHashPair {
    name: String
    hash: String
}

structure ToolIdentityCanonicalPayload {
    /// Always `"tool"` in TS `toolSpecCanonicalPayload`.
    kind: String
    name: String
    description: String
    /// JSON Schema or vendor stub.
    schema: Document
    /// Sorted instruction lines (split from `ToolSpec.instructions` by `\\n\\n` in TS).
    instructions: InstructionLineList
    policies: PolicyIdList
}

/// Pre-hash body for `computeInvocationContextHash` in TS (kind is always `invocation`).
structure InvocationContextCanonicalPayload {
    kind: String
    /// Normalized JSON-only map (sorted keys at every object level); see `normalizeInvocationContextForHash`.
    context: Document
}

// --- Identity link & diffs ---

structure IdentityLink {
    agentId: String
    agentName: String
    staticHash: String
    runtimeHash: String
    @documentation("Optional: omit the member in JSON when not computed. Per-run binding slice; not part of staticHash.")
    invocationHash: String
}

structure ToolRefRow {
    toolKey: String
    toolHash: String
}

structure ToolRefsDiff {
    onlyInFirst: ToolRefRowList
    onlyInSecond: ToolRefRowList
    hashChanged: HashChangeList
}

structure ToolRefHashChange {
    toolKey: String
    firstHash: String
    secondHash: String
}

enum IdentityLinkField {
    @enumValue("agentId")
    AGENT_ID

    @enumValue("agentName")
    AGENT_NAME

    @enumValue("staticHash")
    STATIC_HASH

    @enumValue("runtimeHash")
    RUNTIME_HASH

    @enumValue("invocationHash")
    INVOCATION_HASH
}

structure IdentityLinkFieldChange {
    field: IdentityLinkField
    first: String
    second: String
}

structure IdentityLinksDiff {
    unchanged: IdentityLinkFieldList
    changed: IdentityLinkFieldChangeList
}

// --- Static hash intermediate objects (debug / parity with `hashPlainObject` in tool / toolkit) ---

/// Leaf tool node input to `hashPlainObject` in `tool()` (`computeStaticHash`).
structure ToolStaticHashPayload {
    kind: String
    name: String
    description: String
    schema: Document
    instructions: InstructionLineList
    policies: PolicyIdList
}

structure ToolkitMemberHash {
    name: String
    hash: String
}

list ToolkitMemberHashList {
    member: ToolkitMemberHash
}

structure ToolkitStaticHashPayload {
    kind: String
    name: String
    /// Null in TS is encoded as omitted or JSON `null`; hosts should mirror TS `hashPlainObject`.
    instructions: String
    members: ToolkitMemberHashList
}

structure DynamicToolkitStaticHashPayload {
    kind: String
    name: String
    instructions: String
    policies: PolicyIdList
}

// --- Policy & pipeline hooks (telemetry; not hashed) ---

enum PolicyEvaluatedPhase {
    @enumValue("toolkit")
    TOOLKIT

    @enumValue("tool")
    TOOL

    @enumValue("dynamicToolkit")
    DYNAMIC_TOOLKIT
}

structure PolicyEvaluatedPayload {
    ok: Boolean
    policyId: String
    phase: PolicyEvaluatedPhase
    toolName: String
    composableName: String
    error: String
}

structure ToolExecutedPayload {
    ok: Boolean
    toolName: String
    input: Document
    output: Document
    error: String
    durationMs: Double
}

// --- Persistence-oriented rows (hypothetical host mapping) ---

structure IdentityOpContext {
    /// Epoch milliseconds (wall clock or host monotonic mapping).
    now: Long
    /// Optional tenancy / attribution.
    tenantId: String
    actorId: String
}

structure IdentityLinkRow {
    linkId: String
    sessionId: String
    _ts_created: Long
    agentId: String
    agentName: String
    staticHash: String
    runtimeHash: String
    /// Optional: mirrors TS `IdentityLink.invocationHash`; may be left empty in DB when not used.
    invocationHash: String
    /// Extra host metadata (indices, raw `invocationContext` blob, source, etc. — not hashed here).
    metadata: Document
}

structure RuntimeSnapshotRow {
    snapshotId: String
    sessionId: String
    _ts_created: Long
    runtimeHash: String
    toolRefs: ToolRefRowList
    metadata: Document
}

structure RegisteredAgentRegistrationRow {
    registrationId: String
    agentId: String
    staticHash: String
    /// Denormalized display or full `AgentStaticProps` JSON.
    staticProps: Document
    _ts_created: Long
}

list IdentityLinkRowList {
    member: IdentityLinkRow
}
