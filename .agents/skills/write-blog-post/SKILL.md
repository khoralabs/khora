---
name: write-blog-post
description: >-
  Create or edit khora homepage blog posts (Markdown frontmatter, images, tags).
  Use when adding blog content, writing posts for khoralabs/homepage, updating
  content/posts, or when the user mentions the khora blog, blog manifest, or
  /blog routes.
---

# Write khora homepage blog posts

Blog lives in [`apps/khoralabs/homepage`](../../../apps/khoralabs/homepage). Posts are Markdown with YAML frontmatter, compiled at build/dev time via `@khoralabs/blog`.

## Quick checklist

```
- [ ] Create `content/posts/{slug}.md` (slug = filename without extension)
- [ ] Fill required frontmatter (title, date)
- [ ] Add optional author, tags, description
- [ ] Put images in `public/blog/media/{slug}/` and use `/blog/media/...` URLs
- [ ] Run `bun run generate:blog` from homepage (or `bun dev` / `bun run build`)
- [ ] Open `/blog` and `/blog/{slug}` locally to verify
```

## File locations

| What | Path |
|------|------|
| Post source | `apps/khoralabs/homepage/content/posts/{slug}.md` |
| Post images | `apps/khoralabs/homepage/public/blog/media/{slug}/` |
| Generated (do not edit) | `apps/khoralabs/homepage/src/generated/` (gitignored) |

## Frontmatter

Required and optional fields (parsed by `@khoralabs/blog`):

```yaml
---
title: Human-readable title
date: "2026-05-14"          # ISO date string; posts sort newest first
author: khora labs          # optional
tags:
  - updates                 # optional; drives /blog?tag= filters
  - engineering
description: One-line summary for the blog index card  # optional
---
```

- **slug** comes from the filename (`my-post.md` → slug `my-post`, URL `/blog/my-post`).
- If `title` is omitted, the slug is used as the title.
- `tags` may be a YAML list or a comma-separated string.

## Post body

- Use **GFM Markdown** (headings, lists, bold, links, tables).
- **Internal links** use site-root paths: `[Contact](/contact)`, `[Blog](/blog)`.
- Do not use relative image paths like `![](./photo.png)` — they will not resolve. Use hosted paths below or full `https://` URLs.

Reference post: [`content/posts/welcome.md`](../../../apps/khoralabs/homepage/content/posts/welcome.md).

## Images

1. Add files under `public/blog/media/{slug}/` (e.g. `public/blog/media/welcome/hero.jpg`).
2. Reference with **absolute paths** in Markdown:

```md
![Diagram of the pipeline](/blog/media/welcome/hero.jpg)
```

The Bun server serves these at `GET /blog/media/*` (see [`src/lib/blog-media.ts`](../../../apps/khoralabs/homepage/src/lib/blog-media.ts)).

Allowed extensions: `.avif`, `.gif`, `.jpg`, `.jpeg`, `.png`, `.svg`, `.webp`.

External images (`https://...`) work without files in `public/`.

## Regenerate after changes

From `apps/khoralabs/homepage`:

```bash
bun run generate:blog   # updates src/generated/blog-manifest.ts + posts/*.tsx
```

`bun dev` and `bun run build` run this automatically. Restart dev if it was already running.

## Verify

1. **Index**: `http://localhost:3000/blog` — post appears, sorted by date; tags filter with `?tag=`.
2. **Post**: `http://localhost:3000/blog/{slug}` — title, byline, tags, MDX body render.
3. **Images**: image URLs return 200 (not 404).

## What not to do

- Do not edit `src/generated/blog-manifest.ts` or `src/generated/posts/*.tsx` by hand.
- Do not add post-specific UI to `@khoralabs/blog` — styling stays in homepage (`BlogPostCard`, `MdxAgreement`, `SiteLayout`).
- Do not commit secrets or `.env` content in posts.

## Package boundaries

| Layer | Package / app |
|-------|----------------|
| Post utilities, MDX compile, manifest codegen | `@khoralabs/blog` (`packages/khoralabs/blog`) |
| Routes, layout, images, styling | `apps/khoralabs/homepage` |

To change headless blog behavior (filters, types), edit the package. To change how posts look on the site, edit homepage components only.
