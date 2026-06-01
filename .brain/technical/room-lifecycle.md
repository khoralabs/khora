# Room Lifecycle

How room events touch each storage tier. See `technical/colonnade.md` for tier definitions, `technical/id-conventions.md` for ID formats.

---

## Lifecycle matrix

| Event | Trigger | Tier 1 (catalog) | Tier 3 (inbox) | Tier 4 (rooms / room_frames) | Notes |
|-------|---------|------------------|----------------|-------------------------------|-------|
| **room_created** | `POST /v1/rooms` | `khora:room-registry`, `relay:social:relationship`, optional `khora:room-invite` | If `targetDid`: inline `room_ticket` + optional live WS notification | **`createChannel` → clears `room_frames`**, upserts `rooms` | Creator gets ticket in response; open invite returns `joinToken` |
| **room_ticket pushed** | Same as above, when `targetDid` set | — | `enqueueCellInboxInline` | Preserved (no frames yet) | Admission only — not NBC bytes |
| **room_invite_redeemed** | `POST /v1/rooms/join` | Registry + invite row updated; `bindPeer` | — | **`rotateChannelTicket` — preserves `room_frames`** | Fresh ticket + `webSocketUrl` in response |
| **room_ticket_minted** | `POST /v1/rooms/:id/ticket` | Registry `expiresAtMs`; `refreshRelationshipTicketExpiry` | — | **`rotateChannelTicket` — preserves `room_frames`** | Rejoin for creator or bound peer |
| **room WS attach** | `GET /v1/rooms/:id/ws` | — | — | **Replay** all `room_frames` from id 0, then live relay | Ticket verified via `rooms.pairing_secret_hex` |
| **room_left** | `DELETE /v1/rooms/:id` | Delete registry; `deleteRelationship` | `discardCellInboxRoomTickets` for invitee if set | **Deletes `rooms` + `room_frames`** | Either creator or peer may call |
| **principal teardown** | `RelayPrincipalLifecycle` job | Registration, profile, social indexes cleared | Pending inbox rows removed | **`purgeSocialRelationshipsForPrincipal` deletes each channel's `rooms` + `room_frames`** | See `docs/principal-lifecycle.md` |

---

## Frame buffer retention rules

- **While connected or disconnected:** `relayBytes` appends to `room_frames`; disconnect only removes in-memory peers, not SQLite rows
- **Rejoin:** `rotateChannelTicket` updates admission (Tier 4 `rooms` + Tier 1 registry TTL) **without** truncating `room_frames`
- **New room on same id:** Only `createChannel` at room creation clears the buffer (normally a new UUID per room)
- **Admission expiry:** When `rooms.expires_at_ms` is in the past, `getPairingSecretIfActive` fails → HTTP 410; **`room_frames` are not auto-pruned on expiry**
- **Explicit delete:** `DELETE /v1/rooms/:id` or principal teardown removes `rooms` and `room_frames` for that `channel_id`

---

## Known gaps / deferred

- **Expired room GC:** Expired rooms that were never deleted may retain `room_frames` until relationship teardown or manual delete. A future policy could GC frames when the `rooms` row expires.
- **Bounded retention:** No size caps or TTL on `room_frames` for long-lived rooms — can grow unbounded until teardown.
- **Incremental replay cursors:** Hub always replays from id `0` on attach. The `drainFramesAfter(channelId, afterId)` API supports incremental replay; not wired yet.

---

## Host lifecycle callbacks

`KhoraRoomLifecycleHostEvent` in `@khoralabs/khora-transport` emits (no secrets):
- `room_created`
- `room_ticket_minted`
- `room_invite_redeemed`
