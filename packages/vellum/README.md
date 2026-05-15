# Vellum packages

Shared libraries for **Vellum**: NBC session tooling layered on Atrium rooms — contracts for control/domain wires, an HTTP-oriented client, transport primitives for daemon control, and JSON-schema validation for bind policies.

Runnable binaries (**CLI**, **daemon**) live in [`apps/vellum`](../../apps/vellum).

## Packages

| Directory | npm name | Role |
| --- | --- | --- |
| [`contracts/`](contracts) | `@khoralabs/vellum-contracts` | Zod types for paths, control-plane payloads, domain structs shared by client + daemon. |
| [`client/`](client) | `@khoralabs/vellum-client` | Programmatic API: talks to the Vellum daemon’s control HTTP surface and reads local SQLite state. Uses `@khoralabs/atrium-client` for room/sign-in semantics where needed. |
| [`transport/`](transport) | `@khoralabs/vellum-transport` | Control HTTP client/helpers (`fetch`-based); abstraction point for future UDS/in-proc transports. |
| [`bind-policy/`](bind-policy) | `@khoralabs/vellum-bind-policy` | NBC bind payloads validated with AJV against a bundled JSON Schema draft 2020-12 schema. |

## Dependency sketch

```text
vellum-contracts  ◄──  vellum-client, vellum-bind-policy, apps/vellum daemon & CLI
vellum-transport  ◄──  vellum-client
atrium-client     ◄──  vellum-client (room ticket / HTTP to Atrium host)
```

## Apps

See [`apps/vellum/README.md`](../../apps/vellum/README.md) for `vellum` CLI and `vellum-daemon` usage.
