$version: "2"

namespace cfd.agent_identity

@documentation("""
Hypothetical host storage surface for agent identity attribution (sessions, static registration, runtime snapshots).

**Not implemented** in `@cfd/agent-identity` (that package only computes hashes and payloads).

**Ids & tenancy:** `linkId`, `sessionId`, `registrationId`, `snapshotId`, `tenantId`, `actorId` are host-defined strings; uniqueness and indexes are up to the backend.

**Transactions:** Prefer one outer transaction per logical session update; nesting depends on the driver.

**Idempotency:** `UpsertRegisteredAgentSnapshot` should be idempotent for the same `(agentId, staticHash)`. `RecordSessionIdentityLink` may append or upsert depending on host policy; duplicate `(sessionId, staticHash, runtimeHash)` rows may be allowed for audit or deduped.

**Async:** Mirror with Promise/async in language bindings where applicable.
""")
service AgentIdentityPersistenceService {
    version: "2026-04-12"
    operations: [
        UpsertRegisteredAgentSnapshot
        RecordSessionIdentityLink
        GetLatestIdentityLinkForSession
        ListIdentityLinksForAgent
        RecordRuntimeToolRefSnapshot
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
