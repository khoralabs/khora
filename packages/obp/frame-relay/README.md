# OBP frame relay

Ticket-gated **hub relay** for OBP negotiation byte streams: stamp optional `RelayEnvelope`, fan out opaque frames, and spool them for late joiners.

## Layout

| Path | Package |
| --- | --- |
| `spec/model/` | `@khoralabs/obp-frame-relay-spec` — `RelayEnvelope` wire policy + `FrameRelayStore` persistence service |
| `impl/ts/` | `@khoralabs/obp-frame-relay` — hub runtime, store strategy port, in-memory adapter, Bun WS helpers |
| `sqlite/` | `@khoralabs/obp-frame-relay-sqlite` — reference SQLite `FrameRelayStoreStrategy` |

## TypeScript

```bash
cd packages/obp/frame-relay/impl/ts && bun test && bun run typecheck
cd packages/obp/frame-relay/sqlite && bun test && bun run typecheck
```

Product adapters (Khora room registry, social relationships, inbox `room_ticket` delivery) live outside this package — see `@khoralabs/relay-colonnade` and `@khoralabs/khora-host`.
