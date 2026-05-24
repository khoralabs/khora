$version: "2"

namespace khora.agent_identity

@documentation("""
Hypothetical host storage surface for agent identity attribution (sessions, static registration, runtime snapshots).

**Not implemented** in `@khoralabs/agent-identity` (that package only computes hashes and payloads).

**Ids & tenancy:** `linkId`, `sessionId`, `registrationId`, `snapshotId`, `tenantId`, `actorId` are host-defined strings; uniqueness and indexes are up to the backend.

**Transactions:** Prefer one outer transaction per logical session update; nesting depends on the driver.

**Idempotency:** `UpsertRegisteredAgentSnapshot` should be idempotent for the same `(agentId, staticHash)`. `RecordSessionIdentityLink` may append or upsert depending on host policy; duplicate `(sessionId, staticHash, runtimeHash)` (and optional `invocationHash`) rows may be allowed for audit or deduped. **Changelog (identity lineage):** `IdentityLink` / `IdentityLinkRow` now include optional `invocationHash` for a third fingerprint: per-invocation binding separate from `staticHash` and `runtimeHash` (see `@khoralabs/agent-identity` `computeInvocationContextHash` / `createIdentityLink`).

**Async:** Mirror with Promise/async in language bindings where applicable.

**Snapshots:** `RecordAffordanceSnapshotEnvelope` stores a versioned {@link AgentSnapshotEnvelope} blob (`envelope` as `Document`). **Transitions:** `RecordIdentityTransition` links two `IdentityLinkRow` ids for replay / audit graphs.
""")
service AgentIdentityPersistenceService {
    version: "2026-04-12"
    operations: [
        UpsertRegisteredAgentSnapshot
        RecordSessionIdentityLink
        GetLatestIdentityLinkForSession
        ListIdentityLinksForAgent
        RecordRuntimeToolRefSnapshot
        RecordAffordanceSnapshotEnvelope
        GetAffordanceSnapshotEnvelope
        RecordIdentityTransition
    ]
}

operation UpsertRegisteredAgentSnapshot {
    input: UpsertRegisteredAgentSnapshotInput
    output: UpsertRegisteredAgentSnapshotOutput
}

structure UpsertRegisteredAgentSnapshotInput {
    op: IdentityOpContext
    row: RegisteredAgentRegistrationRow
}

structure UpsertRegisteredAgentSnapshotOutput {
    registrationId: String
}

operation RecordSessionIdentityLink {
    input: RecordSessionIdentityLinkInput
    output: RecordSessionIdentityLinkOutput
}

structure RecordSessionIdentityLinkInput {
    op: IdentityOpContext
    link: IdentityLinkRow
}

structure RecordSessionIdentityLinkOutput {
    linkId: String
}

operation GetLatestIdentityLinkForSession {
    input: GetLatestIdentityLinkForSessionInput
    output: GetLatestIdentityLinkForSessionOutput
}

structure GetLatestIdentityLinkForSessionInput {
    sessionId: String
}

structure GetLatestIdentityLinkForSessionOutput {
    /// Present when a row exists for the session; omitted when none.
    link: IdentityLinkRow
}

operation ListIdentityLinksForAgent {
    input: ListIdentityLinksForAgentInput
    output: ListIdentityLinksForAgentOutput
}

structure ListIdentityLinksForAgentInput {
    agentId: String
    /// Opaque pagination / filter blob (e.g. cursor, `since` timestamp).
    query: Document
}

structure ListIdentityLinksForAgentOutput {
    links: IdentityLinkRowList
    /// Next page cursor or empty when done.
    nextPage: Document
}

operation RecordRuntimeToolRefSnapshot {
    input: RecordRuntimeToolRefSnapshotInput
    output: RecordRuntimeToolRefSnapshotOutput
}

structure RecordRuntimeToolRefSnapshotInput {
    op: IdentityOpContext
    row: RuntimeSnapshotRow
}

structure RecordRuntimeToolRefSnapshotOutput {
    snapshotId: String
}

structure AffordanceSnapshotEnvelopeRow {
    snapshotId: String
    sessionId: String
    _ts_created: Long
    schemaVersion: String
    /// Full {@link AgentSnapshotEnvelope} as JSON (`Document`).
    envelope: Document
    metadata: Document
}

operation RecordAffordanceSnapshotEnvelope {
    input: RecordAffordanceSnapshotEnvelopeInput
    output: RecordAffordanceSnapshotEnvelopeOutput
}

structure RecordAffordanceSnapshotEnvelopeInput {
    op: IdentityOpContext
    row: AffordanceSnapshotEnvelopeRow
}

structure RecordAffordanceSnapshotEnvelopeOutput {
    snapshotId: String
}

operation GetAffordanceSnapshotEnvelope {
    input: GetAffordanceSnapshotEnvelopeInput
    output: GetAffordanceSnapshotEnvelopeOutput
}

structure GetAffordanceSnapshotEnvelopeInput {
    snapshotId: String
}

structure GetAffordanceSnapshotEnvelopeOutput {
    /// Omitted when `snapshotId` is unknown.
    row: AffordanceSnapshotEnvelopeRow
}

structure IdentityTransitionRow {
    transitionId: String
    sessionId: String
    fromLinkId: String
    toLinkId: String
    _ts_created: Long
    metadata: Document
}

operation RecordIdentityTransition {
    input: RecordIdentityTransitionInput
    output: RecordIdentityTransitionOutput
}

structure RecordIdentityTransitionInput {
    op: IdentityOpContext
    row: IdentityTransitionRow
}

structure RecordIdentityTransitionOutput {
    transitionId: String
}
