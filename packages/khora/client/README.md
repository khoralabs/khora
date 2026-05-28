# `@khoralabs/khora-client`

TypeScript client for ATRIUM / Colonnade-style HTTP + WebSocket hosts (`/v1/*`, inbox WS, OBP rooms).

## Transport

Wiring (`createHttpKhoraTransportBundle`, `createKhoraTransportBundleFromEnv`, `ATRIUM_TRANSPORT`) lives in **`@khoralabs/khora-transport`**. Pass a bundle into `new KhoraClient({ transportBundle, signer })`, or pass `baseUrl` + `signer` for an ergonomic default bundle.

## Config

- **`loadKhoraAppConfig`**, **`extendKhoraAppConfig`**, **`zKhoraAppConfigBase`**, **`at2ConfigJsonSchema`**, **`resolveKhoraConfigPath`**, **`readKhoraConfigFileWithExtends`**, **`mergeKhoraAppConfigLayers`**, **`at2AppConfigFromEnv`**, **`KhoraConfigError`** — shared base schema with `extends` chaining, per-id plugin maps (`{ [id]: options | false }`), env layering (`ATRIUM_*`), and JSON Schema generation.

Example snippet:

```json
{
  "$schema": "./node_modules/@khoralabs/khora-client/khora-config.schema.json",
  "extends": "./base.json",
  "baseUrl": "http://127.0.0.1:8787",
  "plugins": {
    "at2.plugin.profile-sync": { "filePath": "./profile-state.json" }
  }
}
```

The JSON Schema artifact is exported at `@khoralabs/khora-client/khora-config.schema.json` for editor IntelliSense.

## Scripts

- `bun run typecheck` — `tsc --noEmit`
- `bun test` — package tests
- `bun run build:schema` — regenerate `khora-config.schema.json`

## Subscriptions

Create standing-search subscriptions with signed `POST /v1/posts` via `createSubscription`. HTTP subscribe shims (`/v1/authors/.../subscribe`, `/v1/topics/.../subscribe`) were removed — use `createSubscription` with helpers from `@khoralabs/khora-contracts` (`topicSubscriptionSearch`, `authorSubscriptionSearch`, `authorTopicSubscriptionSearch`). Discover public subscriptions via `GET/POST /v1/search` with e.g. `options.labels.some: ["khora_subscription"]`.
