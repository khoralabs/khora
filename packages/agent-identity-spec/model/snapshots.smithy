$version: "2"

namespace cfd.agent_identity

/// Whether serialized policy results are authoritative for replay or advisory only.
enum PolicySnapshotMode {
    @enumValue("authoritative")
    AUTHORITATIVE

    @enumValue("hint")
    HINT
}

/// JSON-safe policy closure at capture time (no live policy objects).
/// **authoritative:** treat `results` as ground truth for replay/audit (trust signed snapshots or same trust domain).
/// **hint:** re-run policy evaluation may diverge; `results` are capture-time cache.
structure PolicyEvaluationSnapshot {
    mode: PolicySnapshotMode
    /// Policy id → allowed.
    results: PolicyResultsMap
    capturedAt: Long
    policyBundleId: String
    policyEngineVersion: String
}

map PolicyResultsMap {
    key: String
    value: Boolean
}

map AffordanceToolsMap {
    key: String
    value: ToolSpecWire
}

/// Post-evaluation affordances without handlers.
structure RegisteredAgentAffordancesWire {
    instructions: String
    tools: AffordanceToolsMap
}

structure AgentRuntimeSnapshot {
    identity: IdentityLink
    toolRefs: ToolRefRowList
    affordances: RegisteredAgentAffordancesWire
    policy: PolicyEvaluationSnapshot
    /// JSON-safe `ToolkitContext` subset (e.g. serialized env); pipeline hooks omitted.
    toolkitContext: Document
}

/// Versioned envelope for layered serialization (static / policy / runtime / context).
structure AgentSnapshotEnvelope {
    schemaVersion: String
    static: RegisteredAgentIdentityWire
    policy: PolicyEvaluationSnapshot
    runtime: AgentRuntimeSnapshot
    context: Document
}
