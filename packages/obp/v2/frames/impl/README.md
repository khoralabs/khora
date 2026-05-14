# OBP v2 — frame implementations

Language-specific implementations for the frame protocol live under this directory.

- **`ts/`** — TypeScript package [`@khoralabs/obp-v2-frames-impl`](ts/package.json): **`cfd.obp.frame`** wire types (`Frame`, `SessionInit`, `Sha256HexLower`, …), **`canonical_json`**, length-prefixed framing, **`signing_bytes`** / DAG **tip** helpers, and **`SessionInit`** pubkey-order checks. Smithy source of truth: [`../spec`](../spec). Workspace consumers today include **`@khoralabs/obp-v2-session-impl`**.

Other runtimes (e.g. Go) can add sibling folders later without moving `ts/`.
