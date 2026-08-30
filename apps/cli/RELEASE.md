# Publishing `@khoralabs/khora-cli` to npm

GitHub Actions: [`.github/workflows/release-khora-cli.yml`](../../../.github/workflows/release-khora-cli.yml) (manual `workflow_dispatch`).

Workflow inputs:

| Input | Purpose |
| --- | --- |
| `version` | Semver to publish |
| `tag` | npm dist-tag (`latest` or `next`) |
| `registry_url` | Registry URL baked into compiled CLI default and staged `base.config.json` (default `https://r.khoralabs.com`) |
| `dry_run` | npm publish dry-run only; skip GitHub release / Homebrew bump |

## Packages published (8)

| Package | Role |
| --- | --- |
| `@khoralabs/khora-cli-darwin-arm64` (and linux-*) | Native `khora` binary |
| `@khoralabs/khora-daemon-*` | Native `khora-daemon` binary |
| `@khoralabs/khora-daemon` | Meta launcher + optional platform deps |
| `@khoralabs/khora-cli` | Meta launcher, configs, schema |

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

Local smoke test after `bun run scripts/release/cli/stage.ts 0.0.1-canary`:

```bash
export NPM_TOKEN=...
echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > ~/.npmrc
cd apps/release/cli-darwin-arm64
npm publish --access public --tag next --dry-run
```

## Staging locally

`packages/memories` is a git submodule. CI and local installs need it checked out before `bun install`:

```bash
git submodule update --init --recursive
bun install
bun run --cwd packages/client build:schema
for t in bun-darwin-arm64 bun-linux-x64 bun-linux-arm64; do
  bun run apps/cli/scripts/build.ts "$t"
  bun run apps/daemon/scripts/build.ts "$t"
done
bun run scripts/release/cli/stage.ts 0.0.1-canary
```

Output: `apps/release/`.

## Dist-tags and version alignment

| Tag | Audience | When to use |
| --- | --- | --- |
| `next` | Maintainers / early adopters | Test a release before wide rollout |
| `latest` | Everyone | Promote a tested build for default installs |

All **8** packages must publish under the **same semver** on every release. The meta package (`@khoralabs/khora-cli`) pins `optionalDependencies` to that exact version. Publishing platform packages under newer versions while `latest` still points at an old meta release leaves default installs broken.

**Workflow:** publish to `next` → verify (`khora help`, smoke tests) → publish the **same version** to `latest` (or run one release with tag `latest` once you are confident). Do not iterate platform-only publishes on `next` without also updating the meta package and eventually moving `latest`.

When publishing with the `latest` tag, CI runs `npm dist-tag add <pkg>@<version> latest` on every package after publish.

Before publish, CI smoke-tests each compiled binary (`scripts/release/verify-binaries.ts cli`) so startup crashes (e.g. eager native-binding loads) fail the release.

## GitHub release tarballs + Homebrew

After staging, CI runs `scripts/release/package-tarballs.ts cli <version>` to produce `apps/release/tarballs/khora-<platform>.tar.gz` (CLI + daemon + configs + schema). Assets upload to the **public** [`khoralabs/homebrew-tap`](https://github.com/khoralabs/homebrew-tap) Releases under tag `khora-cli-v<semver>` (source builds remain in the private repo).

The Homebrew formula lives in [`homebrew-tap/Formula/khora.rb`](../../homebrew-tap/Formula/khora.rb). Release CI rewrites it via `scripts/release/bump-homebrew-formula.ts cli <version>` and pushes to [`khoralabs/homebrew-tap`](https://github.com/khoralabs/homebrew-tap) when `HOMEBREW_TAP_TOKEN` is set.

Install:

```bash
brew tap khoralabs/tap
brew install khora
```
