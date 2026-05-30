# Publishing `@khoralabs/khora-cli` to npm

GitHub Actions: [`.github/workflows/release-khora-cli.yml`](../../../.github/workflows/release-khora-cli.yml) (manual `workflow_dispatch`).

## Packages published (8)

| Package | Role |
| --- | --- |
| `@khoralabs/khora-cli-darwin-arm64` (and linux-*) | Native `khora` binary |
| `@khoralabs/khora-daemon-*` | Native `khora-daemon` binary |
| `@khoralabs/khora-daemon` | Meta launcher + optional platform deps |
| `@khoralabs/khora-cli` | Meta launcher, configs, postinstall |

Order: **6 platform** → **daemon meta** → **cli meta**.

## Prerequisites on npmjs.com

1. **Organization** — Create or use the [`@khoralabs`](https://www.npmjs.com/org/khoralabs) scope on npm (Settings → Organizations).
2. **Member** — The npm user tied to `NPM_TOKEN` must be in that org with permission to **publish** packages (not read-only).
3. **Repository secret** — `NPM_TOKEN` on the GitHub repo (Settings → Secrets → Actions).

### Recommended token (granular)

npm → Access Tokens → **Granular Access Token**:

- Packages: **Read and write**
- Scope: `@khoralabs` (or all packages the org owns)
- If the org enforces 2FA for publish: enable **Bypass 2FA** for automation (or publish from a machine with 2FA once to seed the scope)

Classic tokens also work if the user is an org member with publish rights.

## `npm error 404` on `PUT @khoralabs/...`

npm often returns **404 Not Found** on the first publish attempt when the token **cannot create** packages under the scope — not because the package should already exist.

Checklist:

- [ ] `npm whoami` in CI matches an org member (workflow logs this)
- [ ] Org exists and username is listed under Members
- [ ] Token is not expired and has **write** access to `@khoralabs/*`
- [ ] First publish uses `--access public` (workflow and staged `publishConfig` do this)

Local smoke test after `bun run scripts/stage-khora-release.ts 0.0.1-canary`:

```bash
export NPM_TOKEN=...
echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > ~/.npmrc
cd apps/khora/release/cli-darwin-arm64
npm publish --access public --tag next --dry-run
```

## Staging locally

```bash
bun install
bun run --cwd packages/khora/client build:schema
for t in bun-darwin-arm64 bun-linux-x64 bun-linux-arm64; do
  bun run apps/khora/cli/scripts/build.ts "$t"
  bun run apps/khora/daemon/scripts/build.ts "$t"
done
bun run scripts/stage-khora-release.ts 0.0.1-canary
```

Output: `apps/khora/release/`.
