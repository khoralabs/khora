import type { ReactNode } from "react";
import type { BlogPost, BlogPostMeta } from "../types";

export type BlogPostListRenderProps = {
  posts: BlogPostMeta[];
};

export type BlogPostListEmptyRenderProps = {
  activeTag: string | undefined;
  totalCount: number;
};

export type BlogTagFilterRenderProps = {
  tags: string[];
  activeTag: string | undefined;
  hrefForTag: (tag: string | undefined) => string;
};

export type BlogPostViewRenderProps = {
  post: BlogPost;
  byline: string;
  formattedDate: string;
};

export type BlogPostListProps = {
  posts: BlogPostMeta[];
  children: (props: BlogPostListRenderProps) => ReactNode;
};

export type BlogPostListEmptyProps = {
  posts: BlogPostMeta[];
  filteredPosts: BlogPostMeta[];
  activeTag: string | undefined;
  children: (props: BlogPostListEmptyRenderProps) => ReactNode;
};

export type BlogTagFilterProps = {
  posts: BlogPostMeta[];
  activeTag: string | undefined;
  basePath?: string;
  children: (props: BlogTagFilterRenderProps) => ReactNode;
};

export type BlogPostViewProps = {
  post: BlogPost;
  children: (props: BlogPostViewRenderProps) => ReactNode;
};
