import { BlogPostView, getSlugFromPathname, usePostBySlug } from "@khoralabs/blog/react";
import { BlogPostCover } from "@/components/blog-post-cover";
import { MdxAgreement } from "@/components/post";
import { SiteLayout } from "@/components/site-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { blogPosts } from "@/generated/blog-manifest";
import {
  ctaOutlineOnDarkClass,
  fieldTypographyMuted,
  mdxLinkClass,
  pageTitleClass,
} from "@/lib/ui-styles";
import { cn } from "@/lib/utils";

const blogTagBadgeClass =
  "border-[#F4F4EF]/25 bg-transparent text-[#F4F4EF]/80 hover:bg-[#F4F4EF]/10 hover:text-[#F4F4EF]";

import { renderRoute } from "../../../render-route";
import "../../../../styles/globals.css";

function BlogPostNotFound() {
  return (
    <div className="mx-auto w-full max-w-3xl text-center">
      <h1 className={pageTitleClass}>Post not found</h1>
      <p className={cn(fieldTypographyMuted, "mt-4")}>
        That post doesn&apos;t exist or may have been removed.
      </p>
      <Button variant="outline" asChild className={cn(ctaOutlineOnDarkClass, "mt-6")}>
        <a href="/blog">← Back to blog</a>
      </Button>
    </div>
  );
}

function BlogPostPage() {
  const slug = getSlugFromPathname(window.location.pathname) ?? "";
  const post = usePostBySlug(blogPosts, slug);

  if (!post) {
    return (
      <SiteLayout.Root>
        <SiteLayout.Noise />
        <SiteLayout.Frame>
          <SiteLayout.Header />
          <SiteLayout.Main className="items-center justify-center">
            <BlogPostNotFound />
          </SiteLayout.Main>
          <SiteLayout.Footer />
        </SiteLayout.Frame>
      </SiteLayout.Root>
    );
  }

  return (
    <SiteLayout.Root>
      <SiteLayout.Noise />
      <SiteLayout.Frame>
        <SiteLayout.Header />
        <SiteLayout.Main className="items-start justify-start">
          <div className="mx-auto w-full max-w-3xl">
            <p className="mb-6">
              <a href="/blog" className={mdxLinkClass}>
                ← Blog
              </a>
            </p>
            <BlogPostView post={post}>
              {({ post: p, byline }) => (
                <>
                  <header className="mb-8">
                    {p.cover ? (
                      <BlogPostCover src={p.cover} alt={p.title} className="mb-6" loading="eager" />
                    ) : null}
                    <h1 className={pageTitleClass}>{p.title}</h1>
                    {byline ? (
                      <p className={cn(fieldTypographyMuted, "mt-3 text-sm")}>{byline}</p>
                    ) : null}
                    {p.tags.length > 0 ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {p.tags.map((tag) => (
                          <Badge key={tag} variant="outline" asChild className={blogTagBadgeClass}>
                            <a href={`/blog?tag=${encodeURIComponent(tag)}`}>{tag}</a>
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </header>
                  <MdxAgreement Content={p.Content} />
                </>
              )}
            </BlogPostView>
          </div>
        </SiteLayout.Main>
        <SiteLayout.Footer />
      </SiteLayout.Frame>
    </SiteLayout.Root>
  );
}

renderRoute(BlogPostPage);
