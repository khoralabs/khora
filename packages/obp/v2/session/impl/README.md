# OBP v2 — session implementations

Language-specific implementations for the session protocol live under this directory.

- **`ts/`** — [`@khoralabs/obp-v2-session-impl`](ts/package.json): `cfd.obp.session` wire types (`SessionOp`, `SessionEnvelope`, `Checkpoint`, `VerifyError`, …), Merkle/checkpoint helpers, `SessionEnvelope` verification, frame→session-op mapping (**`TURN`**, **`END_OFFERS`**, **`TERMINATE`** → session ops), and re-exports of frame init wire helpers (`SessionInit` / `cfd.obp.frame`). Normative contract: Smithy [`../spec`](../spec). Session impl is **protocol mechanics**, not NBC bind policy.

Other runtimes can add sibling folders later without moving `ts/`.
