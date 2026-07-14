# homebrew-tap

Homebrew tap for [Khora](https://github.com/khoralabs/khora) and [Vellum](https://github.com/khoralabs/vellum) CLI tools.

## Install

```bash
brew tap khoralabs/tap
brew install khora
brew install vellum
```

- `brew install khora` installs `khora` and `khora-daemon`, then runs `khora setup` once to seed `~/.khora/` config templates.
- `brew install vellum` installs `vellum` and `vellum-daemon`, then runs `vellum setup` once to seed `~/.vellum/` config templates.

## Updating formulae

Canonical formulae live in each product monorepo (`khora/homebrew-tap`, `vellum/homebrew-tap`). On each CLI release, that repo’s CI:

1. Uploads platform tarballs to GitHub Releases
2. Rewrites the local `Formula/<name>.rb` with the new version and `sha256`
3. Pushes to the public [`khoralabs/homebrew-tap`](https://github.com/khoralabs/homebrew-tap) repo when `HOMEBREW_TAP_TOKEN` is configured

To publish this directory as the tap repo:

```bash
# one-time: create github.com/khoralabs/homebrew-tap and push this folder
git init homebrew-tap-publish
cp -R Formula README.md homebrew-tap-publish/
cd homebrew-tap-publish
git add .
git commit -m "Initial khora formula"
git remote add origin git@github.com:khoralabs/homebrew-tap.git
git push -u origin main
```

Users then run `brew tap khoralabs/tap` (GitHub resolves `khoralabs/tap` → `khoralabs/homebrew-tap`).

## Repository secret

| Secret | Purpose |
| --- | --- |
| `HOMEBREW_TAP_TOKEN` | PAT or GitHub App token with `contents: write` on `khoralabs/homebrew-tap` |

If unset, release CI still updates the formula in the product repo; sync to the tap repo is manual until the secret is added.
