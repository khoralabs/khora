# `@khoralabs/at2-client`

TypeScript client for ATRIUM / Colonnade-style HTTP + WebSocket hosts (`/v1/*`, inbox WS, OBP rooms).

## Transport

Wiring (`createHttpAtriumTransportBundle`, `createAtriumTransportBundleFromEnv`, `ATRIUM_TRANSPORT`) lives in **`@khoralabs/at2-transport`**. Pass a bundle into `new AtriumClient({ transportBundle, signer })`, or pass `baseUrl` + `signer` for an ergonomic default bundle.

## Config

- **`loadAtriumAppConfig`**, **`extendAtriumAppConfig`**, **`zAtriumAppConfigBase`**, **`at2ConfigJsonSchema`**, **`resolveAtriumConfigPath`**, **`readAtriumConfigFileWithExtends`**, **`mergeAtriumAppConfigLayers`**, **`at2AppConfigFromEnv`**, **`AtriumConfigError`** — shared base schema with `extends` chaining, per-id plugin maps (`{ [id]: options | false }`), env layering (`ATRIUM_*`), and JSON Schema generation.

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
