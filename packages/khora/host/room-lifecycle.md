# Room lifecycle and storage tiers

How room-related host events touch catalog (Tier 1), cell outbox (Tier 2), cell inbox (Tier 3), and frame channel SQLite (Tier 4). Storage tier overview: [colonnade-usage.md](./colonnade-usage.md). Client flow: [`packages/khora/client/README.md`](../client/README.md) (Rooms section).

## Lifecycle matrix

| Event | HTTP / trigger | Tier 1 (catalog) | Tier 2 (outbox) | Tier 3 (inbox) | Tier 4 (`rooms` / `room_frames`) | Notes |
|-------|----------------|------------------|-----------------|----------------|-----------------------------------|-------|
| **room_created** | `POST /v1/rooms` (`handleRoomsCreate`) | `khora:room-registry`, `relay:social:relationship`, optional `khora:room-invite` | — | If `targetDid`: inline `room_ticket` + optional live `inboxHub` notification | **`createChannel` → clears `room_frames`**, upserts `rooms` | Creator gets ticket in response; open invite returns `joinToken` |
| **room_ticket pushed** | Same handler when `targetDid` set | — | — | `enqueueCellInboxInline` | Preserved (no frames yet) | Admission only — not NBC bytes |
| **room_invite_redeemed** | `POST /v1/rooms/join` | Registry + invite row updated; `bindPeer` | — | — | **`rotateChannelTicket` — preserves `room_frames`** | Fresh ticket + `webSocketUrl` in response |
| **room_ticket_minted** | `POST /v1/rooms/:id/ticket` | Registry `expiresAtMs`; `refreshRelationshipTicketExpiry` | — | — | **`rotateChannelTicket` — preserves `room_frames`** | Rejoin for creator or bound peer |
| **room WS attach** | `GET /v1/rooms/:id/ws` or duplex after ticket | — | — | — | **Replay** all `room_frames` (`drainFramesAfter(id, 0)`), then live relay | Ticket verified via `rooms.pairing_secret_hex` |
| **room_left** | `DELETE /v1/rooms/:id` (`handleRoomsRemove`) | Delete registry; `deleteRelationship` | — | `discardCellInboxRoomTickets` for invitee if set | **`deleteRelationship` deletes `rooms` + `room_frames`** | 204; either creator or peer may call |
| **principal teardown** | `RelayPrincipalLifecycle` job | Registration, profile, social indexes cleared | Cell inbox/outbox purged per principal | Pending inbox rows removed with cells | **`purgeSocialRelationshipsForPrincipal` deletes each channel's `rooms` + `room_frames`** | See [`docs/principal-lifecycle.md`](../../docs/principal-lifecycle.md) |

Host lifecycle callbacks (no secrets): `KhoraRoomLifecycleHostEvent` in `@khoralabs/khora-transport` — `room_created`, `room_ticket_minted`, `room_invite_redeemed`.

## Frame buffer retention

- **While connected or disconnected:** `relayBytes` appends to `room_frames`; disconnect only removes in-memory peers, not SQLite rows.
- **Rejoin:** `rotateChannelTicket` updates admission (Tier 4 `rooms` + Tier 1 registry TTL) without truncating `room_frames`.
- **New room on same id:** Only `createChannel` at room creation clears the buffer (normally a new UUID).
- **Admission expiry:** When `rooms.expires_at_ms` is in the past, `getPairingSecretIfActive` fails → HTTP 410 for mint/WS; **`room_frames` are not auto-pruned on expiry**.
- **Explicit delete:** `DELETE /v1/rooms/:id` or principal teardown removes `rooms` and `room_frames` for that `channel_id`.

### Known gap (documented, not auto-fixed)

Expired rooms that were never deleted may retain `room_frames` until relationship teardown or manual delete. A future policy could GC frames when the `rooms` row expires.

### Deferred

- Bounded retention / prune for very long-lived rooms (size caps, TTL on `room_frames`).
- Incremental replay cursors (`afterId > 0`) on attach — API supports it; hub always replays from `0` today.
