# `@khoralabs/vellum-bind-policy`

**AJV** validation of NBC **bind** JSON payloads against a bundled **JSON Schema (draft 2020-12)**. Used by `@khoralabs/vellum-client` (and related tooling) so malformed bind data fails before it reaches session logic.

Exports **`validateVellumBindPayloadForPort`**, schema constants, **`stableStringify`** for deterministic hashing/signing surfaces, and **`formatAjvErrorsForAgent`** for readable validation errors.

## Scripts

- `bun test` — AJV + golden tests
- `bun run typecheck` — `tsc --noEmit`

Barrel: [`src/index.ts`](src/index.ts).
