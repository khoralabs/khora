# OBP v2 — NBC implementations

TypeScript helpers for **Negotiated Binding Convention** in **bilateral** (two-peer) sessions: `NbcTurnBody` parsing, bind-time checks (N1, N3, N4), `applyNbcTurn`, and read helpers for natural session stop.

- **`ts/`** — [`@khoralabs/obp-nbc`](ts/package.json). Smithy: [`../spec`](../spec).

This profile does **not** implement multi-consumer contention (`max_bindings`, N6, etc.).
