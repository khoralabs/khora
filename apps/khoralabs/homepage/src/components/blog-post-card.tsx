import type { BlogPostMeta } from "@khoralabs/blog";
import { formatPostDate } from "@khoralabs/blog/react";

import { BlogPostCover } from "@/components/blog-post-cover";
import { MutedBody } from "@/components/muted-body";
import { ShellLink } from "@/components/shell-link";
import { cn } from "@/lib/utils";

type BlogPostCardProps = {
  post: BlogPostMeta;
  className?: string;
};

export function BlogPostCard({ post, className }: BlogPostCardProps) {
  const dateDisp = formatPostDate(post.date);
  const href = `/blog/${encodeURIComponent(post.slug)}`;

  return (
    <article className={cn("max-w-2xl border-b border-[#F4F4EF]/15 pb-8 last:border-0", className)}>
      {post.cover ? (
        <a href={href} className="mb-4 block">
          <BlogPostCover src={post.cover} alt={post.title} />
        </a>
      ) : null}
      <h2 className="mb-2 text-balance text-xl font-normal leading-tight md:text-2xl">
        <ShellLink href={href} className="no-underline hover:underline">
          {post.title}
        </ShellLink>
      </h2>
      {(dateDisp || post.author) && (
        <MutedBody className="mb-3 text-xs md:text-sm">
          {[dateDisp, post.author].filter(Boolean).join(" · ")}
        </MutedBody>
      )}
      {post.description ? <MutedBody className="mb-3">{post.description}</MutedBody> : null}
      {post.tags.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {post.tags.map((tag) => (
            <span
              key={tag}
              className="rounded border border-[#F4F4EF]/25 px-2 py-0.5 text-xs text-[#F4F4EF]/80"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      <ShellLink href={href} className="text-sm">
        Read more →
      </ShellLink>
    </article>
  );
}
