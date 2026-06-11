# Room Lifecycle (removed from Khora)

Khora no longer hosts negotiation rooms. The former `POST /v1/rooms` surface, embedded `obp-frame-relay` hub, `khora-frames.sqlite`, and inbox `room_ticket` delivery were removed from the monorepo.

**Negotiation transport** belongs on Vellum + deployable `relay-server-http`. See:

- [`technical/khora-vellum-separation.md`](khora-vellum-separation.md)
- [`packages/vellum/spec/channel-relay-deployment.md`](../../packages/vellum/spec/channel-relay-deployment.md)
- OBP contract only: `@khoralabs/obp-frame-relay-spec` (Smithy hub/store protocol)

Future Khora → Vellum handoff will use `negotiation_invite` inbox notifications (not yet implemented).
