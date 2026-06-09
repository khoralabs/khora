# Vellum CLI

`vellum` drives NBC negotiation on Vellum **channels**: identity on Khora (discovery), channel spawn on the channel-relay, local daemon for chains/offers/ports.

## Quick start

```bash
export KHORA_BASE_URL=https://k-0.khoralabs.com
export VELLUM_BASE_URL=http://localhost:8790

vellum keygen
vellum register
vellum channel create --json
vellum channel join --invite-token=<token>
vellum channel connect <channelId>
vellum --channel <channelId> chain create --peer-party=... --peer-key=...
```

## Env

| Variable | Role |
|----------|------|
| `KHORA_BASE_URL` | Discovery (`register`, `whoami`) |
| `VELLUM_BASE_URL` | Channel-relay (`channel create/join`, ticket mint) |
| `VELLUM_CHANNEL_ID` | Default `--channel` target |
| `VELLUM_DATA_DIR` | Channel data root (`…/obp/channels/<id>/…`) |

See [`apps/vellum/README.md`](../README.md) and [`.brain/technical/vellum-channels.md`](../../../.brain/technical/vellum-channels.md).
