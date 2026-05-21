$version: "2"

namespace cfd.obp

/// Issuing actor. Row commit ordering (**`created_seq`**) is an NBC / **`ObpPersistence`** projection concern, not a field on this shape.
structure Party {
    /// Implementations SHOULD use UUID v7 strings.
    id: String
    name: String
}

/// Proposal or workflow step — **identity** and open **`type`**. NBC bind-window (**`expires_turn`** / **`expires_at_relay_ms`**) is **not** a core graph field: it lives on **`cfd.obp.nbc`** TURN wire (`NbcOfferSpec`) and on the **`ObpPersistence`** NBC projection columns (**`nbc_expires_*`**, see **`cfd.obp#ExtendOfferInput`**). Row **`created_seq`** is NBC / persistence (**`cfd.obp.nbc#NbcRowCommitMeta`**), not on this shape.
structure Offer {
    id: String
    /// Open discriminator (domain-specific step name, e.g. workflow id).
    type: String
}

/// Affordance: a continuation point — **identity**, **`type`**, **`promise`**, **`ref`**. NBC bind-window timing is **not** on this core shape; see **`cfd.obp.nbc#NbcPortSpec`** and **`cfd.obp#ExposePortInput`** projection fields. **How many** binds and **terminal UX context** are **`cfd.obp.nbc#NbcPortExposePolicy`** when NBC applies. Row commit ordering (**`created_seq`**) is NBC / persistence, not on this shape.
structure Port {
    id: String
    type: String
    /// Counterparty-facing affordance copy (what this port offers or invites); implementations enforcing UX SHOULD require non-empty on **ExposePort**.
    @default("")
    promise: String
    /// When non-empty, this port aliases another port id for bind resolution (implementations MUST detect cycles).
    @default("")
    ref: String
}

/// Edge record: Party -[EXTENDS]-> Offer. Row commit ordering (**`created_seq`**) for the edge row is NBC / persistence, not on this shape.
structure ExtendsEdge {
    id: String
}

/// Edge record: Offer -[EXPOSES]-> Port. Row commit ordering (**`created_seq`**) for the edge row is NBC / persistence, not on this shape.
structure ExposesEdge {
    id: String
}

/// Edge record: Offer -[BINDS]-> Port — graph identity only. Policy-shaped bind payloads (**`cfd.obp.nbc#NbcBindSatisfaction`**) and **`ObpPersistence`** bind operation **`Document`** fields are defined outside this shape. Row commit ordering (**`created_seq`**) for the edge row is NBC / persistence, not on this shape.
structure BindsEdge {
    id: String
}
