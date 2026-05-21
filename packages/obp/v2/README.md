# OBP v2 — staged Smithy modules

This tree is a **physical split** of the OBP Smithy contract under canonical namespaces (`cfd.obp`, `cfd.obp.frame`, `cfd.obp.session`, `cfd.obp.nbc`, `cfd.obp.frame.http2`). **This v2 tree may diverge** from the monolithic [`packages/obp/persistence/spec`](../persistence/spec) mirror: v2 is the **staging** contract for layering refactors (thin OBP graph, NBC policy, opaque frame bodies) until an explicit repo cutover.

## Layering (OBP vs NBC vs frames)

- **`cfd.obp`:** Peer **DAG** — parties, offers, **ports as affordances** (identity, ref, promise, type), **BINDS** as the bind-with-offer verb (**`BindsEdge`** is graph identity only). Policy payloads use **`cfd.obp.nbc`** shapes and **`ObpPersistence`** **`Document`** fields on bind operations / listings—not fields on **`BindsEdge`**.
- **`cfd.obp.nbc`:** **When** a bind is allowed; **`NbcPortExposePolicy`**, **`NbcBindSatisfaction`**, **`NbcRowCommitMeta`** (`packages/obp/v2/nbc/spec/model/nbc-policy.smithy`); **NegotiatedBindingConvention** rules **N1–N9**.
- **`cfd.obp.frame`:** Signed **Frame** DAG + **`SessionInit`**; **`Frame.body`** is **opaque** JSON for **TURN** / **END_OFFERS** / **TERMINATE** — no normative `TurnBody` / `PortSpec` wire shapes in v2.

```mermaid
flowchart LR
  frame[cfd_obp_frame]
  nbc[cfd_obp_nbc]
  obp[cfd_obp]
  frame -->|"verify chain"| nbc
  nbc -->|"if admissible"| obp
```

## Modules

| Directory | Role | Primary Smithy |
|-----------|------|------------------|
| `model/spec` | Graph vocabulary (`Party`, `Offer`, **thin** `Port`, edges, …) | `model/shapes.smithy` |
| `persistence/spec` | `ObpPersistence` service + ops | `model/persistence.smithy` |
| `nbc/spec` | NBC rules + policy shapes | `model/negotiated-binding-convention.smithy`, `model/nbc-policy.smithy` |
| `frames/spec` | Frame DAG, opaque `body` | `model/frame-protocol.smithy` |
| `session/spec` | Decentralized session | `model/session-protocol.smithy` |
| `transport-http2/spec` | HTTP/2 reference binding | `model/frame-binding-http2.smithy` |

## Canonical namespaces

| Folder | Namespace(s) |
|--------|----------------|
| `model/` | `cfd.obp` |
| `persistence/` | `cfd.obp` (extends the same aggregate via multi-root `sources`) |
| `nbc/` | `cfd.obp.nbc` |
| `frames/` | `cfd.obp.frame` |
| `session/` | `cfd.obp.session` |
| `transport-http2/` | `cfd.obp.frame.http2` |

## Validate

From the repo root, either run all packages in order:

```sh
bash packages/obp/v2/validate-all.sh
```

Or per package (working directory is `…/spec`):

```sh
smithy validate model && smithy build
```

Each `*/spec/smithy-build.json` lists **relative** `sources` (paths ascend to `v2/` then into sibling packages, e.g. `../../model/spec/model`) so downstream builds compose model + local files **without** duplicating shapes in the same namespace.

## Additive vs cutover

- **Until cutover:** run `smithy validate` only **per** `v2/*/spec` package. Do **not** merge [`packages/obp/persistence/spec`](../persistence/spec) model sources with `v2/**` in a single Smithy build, or you will get duplicate definitions for the same namespace.
- **After cutover:** retire or shrink the monolithic spec tree and point CI at these packages; TypeScript can follow the same boundaries.

## Composition (dependency order)

```mermaid
flowchart TB
  modelPkg[v2_model_spec]
  persistPkg[v2_persistence_spec]
  nbcPkg[v2_nbc_spec]
  framesPkg[v2_frames_spec]
  sessionPkg[v2_session_spec]
  http2Pkg[v2_transport_http2_spec]
  modelPkg --> persistPkg
  modelPkg --> framesPkg
  persistPkg --> nbcPkg
  framesPkg --> sessionPkg
  framesPkg --> http2Pkg
```

## npm package names

Private workspace-style names: `@khoralabs/obp-v2-model-spec`, `@khoralabs/obp-v2-persistence-spec`, `@khoralabs/obp-v2-nbc-spec`, `@khoralabs/obp-v2-frames-spec`, `@khoralabs/obp-v2-session-spec`, `@khoralabs/obp-v2-transport-http2-spec`.
