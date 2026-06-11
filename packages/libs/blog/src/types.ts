import type { ComponentType } from "react";

/** Props supported by MDX compiled with `jsxImportSource: "react"`. */
export type MdxRootProps = {
  components?: Record<string, ComponentType<Record<string, unknown>>>;
};

export type BlogPostFrontmatter = {
  title: string;
  date: string;
  author?: string;
  tags: string[];
  description?: string;
  /** Site-root path (`/blog/media/...`) or absolute `https://` URL for the post hero image. */
  cover?: string;
  /** When true, the post is excluded from the blog index and all routes. */
  draft?: boolean;
};

export type BlogPostMeta = BlogPostFrontmatter & { slug: string };

export type BlogPostModule = {
  default: ComponentType<MdxRootProps>;
  frontmatter: BlogPostFrontmatter;
  raw?: string;
};

export type BlogPost = BlogPostMeta & {
  Content: BlogPostModule["default"];
};
