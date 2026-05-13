$version: "2"

namespace cfd.obp.nbc

/// **Negotiated Binding Convention (NBC)** — conventions for **using** the Offer Binding Protocol (`cfd.obp`) in a **negotiated** context (e.g. peer-to-peer negotiation): when a **bind** is admissible, how **`ledger_seq`** relates to **`expires_seq`**, canonical **`max_bindings`** accounting, **`bind_policy`** / **`counterparty_bind`** enforcement, and concurrency expectations.
///
/// NBC is **not** a second graph protocol. It layers **social and orchestration** rules on top of the structural OBP persistence projection (`cfd.obp#ObpPersistence`) and the live negotiation transports in **`cfd.obp.frame`** and **`cfd.obp.session`** (`packages/obp/persistence/spec/model/frame-protocol.smithy`, `session-protocol.smithy`).
///
/// **Relationship to OBP**
/// - **OBP** (`cfd.obp`, `persistence.smithy`) defines the **typed graph**, **persistence operation surface**, and (with frame/session specs) **signed transcript** rules for mutual agreement on projection.
/// - **NBC** defines additional **MUST** rules for implementations that claim **NBC conformance**. An implementation may be **OBP-conformant** without NBC; it **MUST NOT** claim NBC conformance unless it satisfies all normative rules below.
///
/// **Driver model (informative)**
/// - An **NBC driver** applies NBC preconditions, refusals, and policy **around** delegation to a **pure OBP driver** (frames + session envelope + `ObpPersistence` projection without NBC’s extra bind-admissibility rules). Evaluate NBC **before** committing a bind that OBP would otherwise allow at the graph level; after delegation, NBC may attach audit metadata (e.g. `bind_policy_snapshot`) where `cfd.obp` shapes permit.
///
/// **Normative rules (NBC)**
///
/// **N1. Ledger and expiry at bind time.** Reject **BindPort** / bind leg of **ExtendOffer** when the binding **Offer** or target **Port** is expired: current **`ledger_seq`** MUST satisfy **`ledger_seq < expires_seq`** on both (see `cfd.obp` **Offer** / **Port** in `shapes.smithy`). NBC deployments MUST define how **`ledger_seq`** is sourced (session control, host ledger, monotonic counter per store, etc.). Wall-clock **`Date.now()`** as ledger is **discouraged** unless an adapter documents the mapping.
///
/// **N2. `max_bindings` (canonical tally).** Usage against a **Port** MUST NOT exceed that port’s **`max_bindings`**. Counting is **global (canonical)** only: after resolving **`Port.ref`**, every **BINDS** row whose **`portId`** resolves to the same **canonical port id** shares **one** usage tally. NBC does **not** define a separate bind budget per **EXPOSES** edge.
///
/// **N3. `Port.ref` at bind enforcement.** Resolve refs before applying **N2**; detect cycles on the ref chain and reject binds that depend on an invalid ref projection (aligns with OBP graph rules; NBC **requires** this resolution order when enforcing **N2** at bind time).
///
/// **N4. Bind policy.** When a **Port** carries non-empty **`bind_policy`** (`Document`) under NBC, **BindPort** / bind leg of **ExtendOffer** MUST supply **`counterparty_bind`** satisfaction data validated against that policy before committing the **BINDS** edge; validated payload is stored on **`BindsEdge.counterparty_bind`**. **`bind_policy_snapshot`** on the edge is an optional audit copy. Structured JSON for **`bind_policy`** is validated in reference TypeScript via Zod (`PortBindPolicy`); other language bindings SHOULD mirror that shape.
///
/// **N5. Multiple EXPOSES, same `portId`.** More than one **EXPOSES** edge MAY reference the same **`portId`**. Under NBC, any successful bind against that port consumes **`max_bindings`** capacity **for every** such exposure — the **strictest** reading is the **NBC normative** baseline.
///
/// **N6. Concurrent binds.** When two **BindPort** (or bind-via-**ExtendOffer**) operations may commit against the **same** canonical port concurrently, NBC implementations **MUST** enforce **`max_bindings`** **atomically**. If remaining capacity is one, **at most one** operation **MUST** succeed.
///
/// **N7. Multiple sessions and store boundaries.** NBC **N1–N6** apply **within** each **`ObpPersistence`** instance an NBC deployment attaches to frame/session work. Separate instances do **not** aggregate caps; one shared instance applies NBC on that graph, including **N6**. Session-to-store mapping remains **implementation-defined** outside NBC.
///
/// **N8. Revocation (soft close).** NBC implementations MAY set **`expires_seq`** on **Port** / **Offer** to the **current ledger sequence** so subsequent binds fail **N1**. **ListExposedPortEdges** and related `ObpPersistence` reads support orchestration.
///
/// **Errors (informative):** NBC adds failure modes (expired, max bindings exceeded, bind-policy validation failure) mapped at the NBC layer.
///
/// **Transactions (informative):** **ExtendOffer**, **ExposePort**, and **BindPort** SHOULD run atomically where supported; **N6** remains mandatory under concurrency.
///
/// **Narrative:** `packages/obp/documentation/negotiated-binding-convention.md`.
structure NegotiatedBindingConvention {}
