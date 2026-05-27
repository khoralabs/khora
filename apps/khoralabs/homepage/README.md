# bun-react-tailwind-shadcn-template

To install dependencies:

```bash
bun install
```

To start a development server:

```bash
bun dev
```

To run for production:

```bash
bun start
```

`prestart` runs `generate:blog` so `/blog` routes work in deploy (see `src/generated/`, gitignored). The server also regenerates the manifest on boot if it is missing.

**Render / production:** use start command `bun run start` (or `cd apps/khoralabs/homepage && bun run start` from monorepo root with workspace filter). If you only run `bun src/index.ts`, blog routes return **500 Build Failed** when the manifest is absent.

This project was created using `bun init` in bun v1.3.4. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
