# `@khoralabs/at2-client`

TypeScript client for AT2 / Colonnade-style HTTP + WebSocket hosts (`/v1/*`, inbox WS, OBP rooms).

## Transport

Wiring (`createHttpAt2TransportBundle`, `createAt2TransportBundleFromEnv`, `AT2_TRANSPORT`) lives in **`@khoralabs/at2-transport`**. Pass a bundle into `new At2Client({ transportBundle, signer })`, or pass `baseUrl` + `signer` for an ergonomic default bundle.

## Config

- **`loadAt2AppConfig`**, **`extendAt2AppConfig`**, **`zAt2AppConfigBase`**, **`at2ConfigJsonSchema`**, **`resolveAt2ConfigPath`**, **`readAt2ConfigFileWithExtends`**, **`mergeAt2AppConfigLayers`**, **`at2AppConfigFromEnv`**, **`At2ConfigError`** — shared base schema with `extends` chaining, per-id plugin maps (`{ [id]: options | false }`), env layering (`AT2_*`), and JSON Schema generation.

Example snippet:

```json
{
  "$schema": "./node_modules/@khoralabs/at2-client/at2-config.schema.json",
  "extends": "./base.json",
  "baseUrl": "http://127.0.0.1:8787",
  "plugins": {
    "at2.plugin.profile-sync": { "filePath": "./profile-state.json" }
  }
}
```

The JSON Schema artifact is exported at `@khoralabs/at2-client/at2-config.schema.json` for editor IntelliSense.

## Scripts

- `bun run typecheck` — `tsc --noEmit`
- `bun test` — package tests
- `bun run build:schema` — regenerate `at2-config.schema.json`
