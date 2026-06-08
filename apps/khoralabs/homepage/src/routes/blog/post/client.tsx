import { BlogPostView, getSlugFromPathname, usePostBySlug } from "@khoralabs/blog/react";

import { BlogPostCover } from "@/components/blog-post-cover";
import { MutedBody } from "@/components/muted-body";
import { PageTitle } from "@/components/page-title";
import { MdxAgreement } from "@/components/post";
import { ShellLink } from "@/components/shell-link";
import { SiteLayout } from "@/components/site-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { blogPosts } from "@/generated/blog-manifest";
import { renderRoute } from "../../../render-route";
import "../../../../styles/globals.css";

function BlogPostNotFound() {
  return (
    <div className="mx-auto w-full max-w-3xl text-center">
      <PageTitle>Post not found</PageTitle>
      <MutedBody className="mt-4">That post doesn&apos;t exist or may have been removed.</MutedBody>
      <Button variant="shell-outline" asChild className="mt-6">
        <a href="/blog">← Back to blog</a>
      </Button>
    </div>
  );
}

export function BlogPostPage({ slug }: { slug: string }) {
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
              <ShellLink href="/blog">← Blog</ShellLink>
            </p>
            <BlogPostView post={post}>
              {({ post: p, byline }) => (
                <>
                  <header className="mb-8">
                    {p.cover ? (
                      <BlogPostCover src={p.cover} alt={p.title} className="mb-6" loading="eager" />
                    ) : null}
                    <PageTitle>{p.title}</PageTitle>
                    {byline ? <MutedBody className="mt-3 text-sm">{byline}</MutedBody> : null}
                    {p.tags.length > 0 ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {p.tags.map((tag) => (
                          <Badge
                            key={tag}
                            variant="outline"
                            asChild
                            className="border-[#F4F4EF]/25 bg-transparent text-[#F4F4EF]/80 hover:bg-[#F4F4EF]/10 hover:text-[#F4F4EF]"
                          >
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

if (typeof document !== "undefined") {
  const slug = getSlugFromPathname(window.location.pathname) ?? "";
  renderRoute(BlogPostPage, { slug });
}
