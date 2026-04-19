$version: "2"

namespace cfd.agent_identity

@documentation("""
Pure data operations: diffs and human-readable comparison for dashboards.

Does not execute composable evaluation or hashing; those live in `@cfd/agent-identity` at runtime.
""")
service AgentIdentityPublic {
    version: "2026-04-12"
    operations: [
        DiffToolRefs
        DiffIdentityLinks
        ExplainIdentityLinkRelationship
    ]
}

operation DiffToolRefs {
    input: DiffToolRefsInput
    output: DiffToolRefsOutput
}

structure DiffToolRefsInput {
    first: ToolRefRowList
    second: ToolRefRowList
}

structure DiffToolRefsOutput {
    diff: ToolRefsDiff
}

operation DiffIdentityLinks {
    input: DiffIdentityLinksInput
    output: DiffIdentityLinksOutput
}

structure DiffIdentityLinksInput {
    first: IdentityLink
    second: IdentityLink
}

structure DiffIdentityLinksOutput {
    diff: IdentityLinksDiff
}

operation ExplainIdentityLinkRelationship {
    input: ExplainIdentityLinkRelationshipInput
    output: ExplainIdentityLinkRelationshipOutput
}

structure ExplainIdentityLinkRelationshipInput {
    first: IdentityLink
    second: IdentityLink
}

structure ExplainIdentityLinkRelationshipOutput {
    /// Non-i18n diagnostic string (see `explainIdentityLinkRelationship` in TS).
    explanation: String
}
