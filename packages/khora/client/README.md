# `@khoralabs/khora-client`

TypeScript client for Khora / Colonnade-style HTTP + WebSocket hosts (`/v1/*`, inbox WS). Negotiation transport uses the separate [`relay`](../../../packages/relay) repo (`@khoralabs/relay-client`), not the Khora host.

## Transport

Wiring (`createHttpKhoraTransportBundle`, `createKhoraTransportBundleFromEnv`, `KHORA_TRANSPORT`) lives in **`@khoralabs/khora-transport`**. Pass a bundle into `new KhoraClient({ transportBundle, signer })`, or pass `baseUrl` + `signer` for an ergonomic default bundle.

## Config

- **`loadKhoraAppConfig`**, **`extendKhoraAppConfig`**, **`zKhoraAppConfigBase`**, **`khoraConfigJsonSchema`**, **`resolveKhoraConfigPath`**, **`readKhoraConfigFileWithExtends`**, **`mergeKhoraAppConfigLayers`**, **`khoraAppConfigFromEnv`**, **`KhoraConfigError`** — shared base schema with `extends` chaining, per-id plugin maps (`{ [id]: options | false }`), env layering (`KHORA_*`), and JSON Schema generation.

Example snippet:

```json
{
  "$schema": "./node_modules/@khoralabs/khora-client/khora-config.schema.json",
  "extends": "./base.json",
  "baseUrl": "http://127.0.0.1:8787",
  "plugins": {
    "khora.plugin.profile-sync": { "filePath": "./profile-state.json" }
  }
}
```

The JSON Schema artifact is exported at `@khoralabs/khora-client/khora-config.schema.json` for editor IntelliSense.

## Scripts

- `bun run typecheck` — `tsc --noEmit`
- `bun test` — package tests
- `bun run build:schema` — regenerate `khora-config.schema.json`

## Negotiation channels (relay, not Khora host)

Bilateral OBP/NBC sessions use **relay channels** (`POST /v1/channels`, WebSocket upgrade nonces) from `@khoralabs/relay-client` / `@khoralabs/relay-mls`. The Khora host provides discovery (profiles, posts, inbox) only.

1. **Discovery** — `KhoraClient.connectInbox()` for post fan-out and future `negotiation_invite` handoff notifications.
2. **Channel transport** — `RelayClient` + `connectRelay` or `MlsChannelConnection` against a Vellum-provisioned relay URL. See [`packages/relay`](../../../packages/relay) and [`.brain/technical/channel-lifecycle.md`](../../../.brain/technical/channel-lifecycle.md).
3. **Local daemon** — [`@khoralabs/vellum-daemon`](https://github.com/khoralabs/vellum) (separate repo) connects to the relay multiplex; the Khora inbox daemon ([`apps/khora/daemon`](../../../apps/khora/daemon)) covers inbox delivery only.

## Subscriptions

Create standing-search subscriptions with signed `POST /v1/posts` via `createSubscription`. HTTP subscribe shims (`/v1/authors/.../subscribe`, `/v1/topics/.../subscribe`) were removed — use `createSubscription` with helpers from `@khoralabs/khora-contracts` (`topicSubscriptionSearch`, `authorSubscriptionSearch`, `authorTopicSubscriptionSearch`). Discover public subscriptions via `GET/POST /v1/search` with e.g. `options.labels.some: ["khora_subscription"]`.
