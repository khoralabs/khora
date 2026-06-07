$version: "2"

namespace khora.obp.nbc

/// **Negotiated Binding Convention (NBC)** — conventions for **using** the Offer Binding Protocol (`khora.obp`) in a **negotiated** context (e.g. peer-to-peer negotiation): when a **bind** is admissible, how **`turn_seq`** and **`relay_ts_ms`** (from **`khora.obp.frame.relay#RelayEnvelope`** when hub relay policy applies) relate to NBC bind windows (**`NbcOfferSpec`**, **`NbcPortSpec`**, and **`ObpPersistence`** **`nbc_expires_*`** projections — **not** fields on thin **`khora.obp#Offer` / `khora.obp#Port`**), canonical **`NbcPortExposePolicy.max_bindings`** tally, **`terminal`** / **`bind_policy`** / TTL context, **`NbcBindSatisfaction`**, **`NbcRowCommitMeta`** (`created_seq`), and concurrency expectations.
///
/// NBC is **not** a second graph protocol. It layers **social and orchestration** rules on top of the structural OBP persistence projection (`khora.obp#ObpPersistence`) and the live negotiation transports in **`khora.obp.frame`** and **`khora.obp.session`** (`packages/obp/v2/frames/spec/model/frame-protocol.smithy`, `packages/obp/v2/session/spec/model/session-protocol.smithy`).
///
/// **Relationship to OBP**
/// - **OBP** (`khora.obp`, `packages/obp/v2/persistence/spec/model/persistence.smithy`) defines the **typed graph**, **persistence operation surface**, and (with frame/session specs) **signed transcript** rules for mutual agreement on projection. **`khora.obp#Port`** / **`khora.obp#Offer`** are **thin** identity + workflow shapes (**no** NBC bind-window fields); row **`created_seq`** and **`nbc_expires_*`** projections are persistence / NBC concerns (see **`khora.obp.nbc#NbcRowCommitMeta`**, **`GetNbcBindWindowForOffer`**, **`GetNbcBindWindowForPort`**). **Bind capacity, terminal hint, bind-policy JSON, and TTL/expose context** live on **`khora.obp.nbc#NbcPortExposePolicy`** (`packages/obp/v2/nbc/spec/model/nbc-policy.smithy`).
/// - **NBC** defines additional **MUST** rules for implementations that claim **NBC conformance**. An implementation may be **OBP-conformant** without NBC; it **MUST NOT** claim NBC conformance unless it satisfies all normative rules below.
///
/// **Driver model (informative)**
/// - An **NBC driver** applies NBC preconditions, refusals, and policy **around** delegation to a **pure OBP driver** (opaque frame **`body`** verification + session envelope + `ObpPersistence` projection without NBC’s extra bind-admissibility rules). Evaluate NBC **before** committing a bind that OBP would otherwise allow at the graph level.
///
/// **Normative rules (NBC)**
///
/// **N1. Expiry at bind time.** Reject **BindPort** / bind leg of **ExtendOffer** when the binding **offer** or target **port** NBC bind window is expired per **either** active mode: resolve **`expires_turn`** / **`expires_at_relay_ms`** from **`NbcTurnBody`** / persisted **`nbc_expires_*`** projection for those rows (not from thin **`khora.obp#Offer` / `Port`**). If **`expires_turn ≠ 0`**, require **`turn_seq < expires_turn`**; if **`expires_at_relay_ms ≠ 0`**, require **`relay_ts_ms < expires_at_relay_ms`** where **`relay_ts_ms`** is taken from **`khora.obp.frame.relay#RelayEnvelope`** on the **TURN** when hub relay policy applies (same envelope for both parties). **`turn_seq`** is the count of DAG-committed frames on the chain before applying that **TURN** (implementation-defined equivalence to session ops).
///
/// **N2. `max_bindings` (canonical tally).** Successful binds against a canonical port (after resolving **`khora.obp#Port.ref`**) MUST NOT exceed the effective **`NbcPortExposePolicy.max_bindings`** for that expose. Counting is **global (canonical)** only: every **BINDS** row whose **`portId`** resolves to the same **canonical port id** shares **one** usage tally. NBC does **not** define a separate bind budget per **EXPOSES** edge. NBC-conformant deployments MUST record **`max_bindings`** (and related policy) on **`NbcPortExposePolicy`** at expose time; OBP-only stacks without NBC MAY apply adapter-defined defaults outside this spec.
///
/// **N3. `Port.ref` at bind enforcement.** Resolve refs before applying **N2**; detect cycles on the ref chain and reject binds that depend on an invalid ref projection (aligns with OBP graph rules; NBC **requires** this resolution order when enforcing **N2** at bind time).
///
/// **N4. Bind policy.** When an expose path carries non-empty **`NbcPortExposePolicy.bind_policy`**, **BindPort** / bind leg of **ExtendOffer** MUST supply **`bind_payload`** (`Document` on the **`ObpPersistence`** operation / listing surface) that validates against that policy before committing the **BINDS** edge; validated payload is stored with the bind row. **Vellum** canonical **`bind_policy`** on the wire is JSON Schema (draft 2020-12) for **`bind_payload`**; other products MAY use other shapes if their host validator agrees.
///
/// **N5. Multiple EXPOSES, same `portId`.** More than one **EXPOSES** edge MAY reference the same **`portId`**. Under NBC, any successful bind against that port consumes **`NbcPortExposePolicy.max_bindings`** capacity **for every** such exposure — the **strictest** reading is the **NBC normative** baseline.
///
/// **N6. Concurrent binds.** When two **BindPort** (or bind-via-**ExtendOffer**) operations may commit against the **same** canonical port concurrently, NBC implementations **MUST** enforce **`NbcPortExposePolicy.max_bindings`** **atomically**. If remaining capacity is one, **at most one** operation **MUST** succeed.
///
/// **N7. Multiple sessions and store boundaries.** NBC **N1–N8** apply **within** each **`ObpPersistence`** instance an NBC deployment attaches to frame/session work. Separate instances do **not** aggregate caps; one shared instance applies NBC on that graph, including **N6**. Session-to-store mapping remains **implementation-defined** outside NBC.
///
/// **N8. Revocation (soft close).** NBC implementations MAY set **`nbc_expires_*`** projection (or wire equivalents on **`NbcOfferSpec` / `NbcPortSpec`**) so subsequent binds fail **N1** (e.g. relay ceiling at or before revocation via **`SetPortExpiredNow` / `SetOfferExpiredNow`**). **`NbcPortExposePolicy.terminal`** is an orchestration hint (e.g. completion workflows); it does not alter OBP graph topology. **ListExposedPortEdges** and related `ObpPersistence` reads support orchestration.
///
/// **N9. Row `created_seq` (commit metadata).** Implementations **MAY** persist a monotonic **`created_seq`** per stored graph row using **`khora.obp.nbc#NbcRowCommitMeta`** semantics. It is **not** part of **`khora.obp`** Smithy shapes (`packages/obp/v2/model/spec/model/shapes.smithy`); it supports NBC / adapter ordering and audit.
///
/// **Errors (informative):** NBC adds failure modes (expired, max bindings exceeded, bind-policy validation failure) mapped at the NBC layer.
///
/// **Transactions (informative):** **ExtendOffer**, **ExposePort**, and **BindPort** SHOULD run atomically where supported; **N6** remains mandatory under concurrency.
///
/// **Narrative:** `packages/obp/documentation/negotiated-binding-convention.md`.
structure NegotiatedBindingConvention {}
