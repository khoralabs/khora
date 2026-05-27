import type { BlogPostMeta } from "@khoralabs/blog";
import { formatPostDate } from "@khoralabs/blog/react";

import { fieldTypographyMuted, mdxLinkClass, pageTitleClass } from "@/lib/ui-styles";
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
      <h2 className={cn(pageTitleClass, "mb-2 text-xl md:text-2xl")}>
        <a href={href} className={cn(mdxLinkClass, "no-underline hover:underline")}>
          {post.title}
        </a>
      </h2>
      {(dateDisp || post.author) && (
        <p className={cn(fieldTypographyMuted, "mb-3 text-xs md:text-sm")}>
          {[dateDisp, post.author].filter(Boolean).join(" · ")}
        </p>
      )}
      {post.description ? (
        <p className={cn(fieldTypographyMuted, "mb-3")}>{post.description}</p>
      ) : null}
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
      <a href={href} className={cn(mdxLinkClass, "text-sm")}>
        Read more →
      </a>
    </article>
  );
}
