import type { ComponentProps } from "react";
import { buildByline, formatPostDate, formatPostDateFull } from "../format";
import { getAllTags } from "../posts";
import type {
  BlogPostListEmptyProps,
  BlogPostListProps,
  BlogPostViewProps,
  BlogTagFilterProps,
} from "./types";

export type BlogRootProps = ComponentProps<"div">;

export function BlogRoot({ className, children, ...props }: BlogRootProps) {
  return (
    <div data-slot="blog-root" className={className} {...props}>
      {children}
    </div>
  );
}

export function BlogPostList({ posts, children }: BlogPostListProps) {
  if (posts.length === 0) return null;
  return <>{children({ posts })}</>;
}

export function BlogPostListEmpty({
  posts,
  filteredPosts,
  activeTag,
  children,
}: BlogPostListEmptyProps) {
  if (posts.length > 0 && filteredPosts.length > 0) return null;
  return (
    <>
      {children({
        activeTag,
        totalCount: posts.length,
      })}
    </>
  );
}

export function BlogTagFilter({
  posts,
  activeTag,
  basePath = "/blog",
  children,
}: BlogTagFilterProps) {
  const tags = getAllTags(posts);
  if (tags.length === 0) return null;

  const hrefForTag = (tag: string | undefined) => {
    if (tag) return `${basePath}?tag=${encodeURIComponent(tag)}`;
    return basePath;
  };

  return <>{children({ tags, activeTag, hrefForTag })}</>;
}

export function BlogPostView({ post, children }: BlogPostViewProps) {
  const formattedDate = formatPostDateFull(post.date);
  const byline = buildByline(post);
  return <>{children({ post, byline, formattedDate })}</>;
}

export { buildByline, formatPostDate, formatPostDateFull };
