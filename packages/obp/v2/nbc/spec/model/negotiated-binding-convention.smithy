$version: "2"

namespace cfd.obp.nbc

/// **Negotiated Binding Convention (NBC)** — conventions for **using** the Offer Binding Protocol (`cfd.obp`) in a **negotiated** context (e.g. peer-to-peer negotiation): when a **bind** is admissible, how **`ledger_seq`** relates to **`expires_seq`**, canonical **`NbcPortExposePolicy.max_bindings`** tally, **`terminal`** / **`bind_policy`** / TTL context, **`NbcBindSatisfaction`**, **`NbcRowCommitMeta`** (`created_seq`), and concurrency expectations.
///
/// NBC is **not** a second graph protocol. It layers **social and orchestration** rules on top of the structural OBP persistence projection (`cfd.obp#ObpPersistence`) and the live negotiation transports in **`cfd.obp.frame`** and **`cfd.obp.session`** (`packages/obp/v2/frames/spec/model/frame-protocol.smithy`, `packages/obp/v2/session/spec/model/session-protocol.smithy`).
///
/// **Relationship to OBP**
/// - **OBP** (`cfd.obp`, `packages/obp/v2/persistence/spec/model/persistence.smithy`) defines the **typed graph**, **persistence operation surface**, and (with frame/session specs) **signed transcript** rules for mutual agreement on projection. **`cfd.obp#Port`** is a **thin** affordance row (**identity, expiry, ref, promise, type**); **`Party`** / **`Offer`** omit row **`created_seq`** (see **`cfd.obp.nbc#NbcRowCommitMeta`**). **Bind capacity, terminal hint, bind-policy JSON, and TTL/expose context** live on **`cfd.obp.nbc#NbcPortExposePolicy`** (`packages/obp/v2/nbc/spec/model/nbc-policy.smithy`).
/// - **NBC** defines additional **MUST** rules for implementations that claim **NBC conformance**. An implementation may be **OBP-conformant** without NBC; it **MUST NOT** claim NBC conformance unless it satisfies all normative rules below.
///
/// **Driver model (informative)**
/// - An **NBC driver** applies NBC preconditions, refusals, and policy **around** delegation to a **pure OBP driver** (opaque frame **`body`** verification + session envelope + `ObpPersistence` projection without NBC’s extra bind-admissibility rules). Evaluate NBC **before** committing a bind that OBP would otherwise allow at the graph level; after delegation, NBC may attach audit metadata (e.g. **`NbcBindPolicyAuditSnapshot`**) via **`bind_policy_snapshot`** on **BindPort** / listing rows where adapters persist it.
///
/// **Normative rules (NBC)**
///
/// **N1. Ledger and expiry at bind time.** Reject **BindPort** / bind leg of **ExtendOffer** when the binding **Offer** or target **Port** is expired: current **`ledger_seq`** MUST satisfy **`ledger_seq < expires_seq`** on both (see `cfd.obp` **Offer** / **Port** in `packages/obp/v2/model/spec/model/shapes.smithy`). NBC deployments MUST define how **`ledger_seq`** is sourced (session control, host ledger, monotonic counter per store, etc.). Wall-clock **`Date.now()`** as ledger is **discouraged** unless an adapter documents the mapping.
///
/// **N2. `max_bindings` (canonical tally).** Successful binds against a canonical port (after resolving **`cfd.obp#Port.ref`**) MUST NOT exceed the effective **`NbcPortExposePolicy.max_bindings`** for that expose. Counting is **global (canonical)** only: every **BINDS** row whose **`portId`** resolves to the same **canonical port id** shares **one** usage tally. NBC does **not** define a separate bind budget per **EXPOSES** edge. NBC-conformant deployments MUST record **`max_bindings`** (and related policy) on **`NbcPortExposePolicy`** at expose time; OBP-only stacks without NBC MAY apply adapter-defined defaults outside this spec.
///
/// **N3. `Port.ref` at bind enforcement.** Resolve refs before applying **N2**; detect cycles on the ref chain and reject binds that depend on an invalid ref projection (aligns with OBP graph rules; NBC **requires** this resolution order when enforcing **N2** at bind time).
///
/// **N4. Bind policy.** When an expose path carries non-empty **`NbcPortExposePolicy.bind_policy`**, **BindPort** / bind leg of **ExtendOffer** MUST supply **`bind_payload`** (`Document` on the **`ObpPersistence`** operation / listing surface) whose bytes validate against that policy before committing the **BINDS** edge; validated payload is stored with the bind row. **`bind_policy_snapshot`** on listing rows MAY hold an **`NbcBindPolicyAuditSnapshot`**. Structured JSON for **`bind_policy`** is **NBC-defined**; reference implementations MAY validate with language-specific schemas.
///
/// **N5. Multiple EXPOSES, same `portId`.** More than one **EXPOSES** edge MAY reference the same **`portId`**. Under NBC, any successful bind against that port consumes **`NbcPortExposePolicy.max_bindings`** capacity **for every** such exposure — the **strictest** reading is the **NBC normative** baseline.
///
/// **N6. Concurrent binds.** When two **BindPort** (or bind-via-**ExtendOffer**) operations may commit against the **same** canonical port concurrently, NBC implementations **MUST** enforce **`NbcPortExposePolicy.max_bindings`** **atomically**. If remaining capacity is one, **at most one** operation **MUST** succeed.
///
/// **N7. Multiple sessions and store boundaries.** NBC **N1–N8** apply **within** each **`ObpPersistence`** instance an NBC deployment attaches to frame/session work. Separate instances do **not** aggregate caps; one shared instance applies NBC on that graph, including **N6**. Session-to-store mapping remains **implementation-defined** outside NBC.
///
/// **N8. Revocation (soft close).** NBC implementations MAY set **`expires_seq`** on **Port** / **Offer** to the **current ledger sequence** so subsequent binds fail **N1**. **`NbcPortExposePolicy.terminal`** is an orchestration hint (e.g. completion workflows); it does not alter OBP graph topology. **ListExposedPortEdges** and related `ObpPersistence` reads support orchestration.
///
/// **N9. Row `created_seq` (commit metadata).** Implementations **MAY** persist a monotonic **`created_seq`** per stored graph row using **`cfd.obp.nbc#NbcRowCommitMeta`** semantics. It is **not** part of **`cfd.obp`** Smithy shapes (`packages/obp/v2/model/spec/model/shapes.smithy`); it supports NBC / adapter ordering and audit alongside **`ledger_seq`**.
///
/// **Errors (informative):** NBC adds failure modes (expired, max bindings exceeded, bind-policy validation failure) mapped at the NBC layer.
///
/// **Transactions (informative):** **ExtendOffer**, **ExposePort**, and **BindPort** SHOULD run atomically where supported; **N6** remains mandatory under concurrency.
///
/// **Narrative:** `packages/obp/documentation/negotiated-binding-convention.md`.
structure NegotiatedBindingConvention {}
