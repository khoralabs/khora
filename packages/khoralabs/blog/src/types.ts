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
