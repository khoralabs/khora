# Blog post images

Place images here and reference them in Markdown with **site-root absolute paths**:

```md
![Alt text](/blog/media/welcome/hero.jpg)
```

Layout:

```text
public/blog/media/{post-slug}/your-image.png
```

Supported formats: `.avif`, `.gif`, `.jpg`, `.jpeg`, `.png`, `.svg`, `.webp`

## Cover images

Set the post hero in frontmatter (wide 21:9 crop on index and post pages):

```yaml
cover: /blog/media/welcome/cover.jpg
```

`coverImage` is accepted as an alias for `cover`.
