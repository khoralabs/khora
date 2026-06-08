import {
  BlogPostList,
  BlogPostListEmpty,
  BlogRoot,
  BlogTagFilter,
  useBlogManifest,
} from "@khoralabs/blog/react";
import { ArrowUpRight, Newspaper } from "lucide-react";
import { BlogPostCard } from "@/components/blog-post-card";
import { SiteLayout } from "@/components/site-layout";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { blogPosts } from "@/generated/blog-manifest";
import {
  ctaLinkMutedClass,
  ctaOutlineOnDarkClass,
  ctaSolidOnDarkClass,
  emptyStateDescriptionClass,
  emptyStateIconWrapClass,
  emptyStatePanelClass,
  emptyStateTitleClass,
  fieldTypographyMuted,
  mdxLinkClass,
} from "@/lib/ui-styles";

const blogTagToggleItemClass =
  "border-[#F4F4EF]/25 bg-transparent text-sm text-[#F4F4EF] hover:bg-[#F4F4EF]/10 hover:text-[#F4F4EF] data-[state=on]:border-[#F4F4EF]/50 data-[state=on]:bg-[#F4F4EF]/10 data-[state=on]:text-[#F4F4EF]";

import { cn } from "@/lib/utils";
import { renderRoute } from "../../render-route";
import "../../../styles/globals.css";

function BlogEmptyState() {
  return (
    <Empty className={emptyStatePanelClass}>
      <EmptyHeader>
        <EmptyMedia variant="icon" className={emptyStateIconWrapClass}>
          <Newspaper />
        </EmptyMedia>
        <EmptyTitle className={emptyStateTitleClass}>No posts yet</EmptyTitle>
        <EmptyDescription className={emptyStateDescriptionClass}>
          Writing from the lab will land here. Until then, reach out if you&apos;d like to
          collaborate.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row justify-center gap-2">
        <Button asChild className={ctaSolidOnDarkClass}>
          <a href="/contact">Get in touch</a>
        </Button>
        <Button variant="outline" asChild className={ctaOutlineOnDarkClass}>
          <a href="/">Home</a>
        </Button>
      </EmptyContent>
      <Button variant="link" asChild className={ctaLinkMutedClass} size="sm">
        <a href="/contact">
          Learn more <ArrowUpRight />
        </a>
      </Button>
    </Empty>
  );
}

export function BlogPage({ initialTag }: { initialTag?: string } = {}) {
  const initialSearch = initialTag ? `?tag=${encodeURIComponent(initialTag)}` : "";
  const { posts, filteredPosts, activeTag, setTag } = useBlogManifest(blogPosts, initialSearch);

  return (
    <SiteLayout.Root>
      <SiteLayout.Noise />
      <SiteLayout.Frame>
        <SiteLayout.Header />
        <SiteLayout.Main className="items-start justify-start">
          <div className="mx-auto w-full max-w-3xl">
            <h1 className="mb-2 text-balance text-2xl font-normal leading-tight md:text-3xl">
              Blog
            </h1>
            <p className={cn(fieldTypographyMuted, "mb-8")}>
              Updates from the lab on products, engineering, and preview releases.
            </p>

            <BlogRoot className="flex flex-col gap-8">
              <BlogTagFilter posts={posts} activeTag={activeTag}>
                {({ tags: tagList }) => (
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    spacing={2}
                    value={activeTag ?? "all"}
                    onValueChange={(value) => {
                      if (!value) return;
                      setTag(value === "all" ? undefined : value);
                    }}
                    className="flex w-full flex-wrap"
                    aria-label="Filter by tag"
                  >
                    <ToggleGroupItem value="all" className={blogTagToggleItemClass}>
                      All
                    </ToggleGroupItem>
                    {tagList.map((tag) => (
                      <ToggleGroupItem key={tag} value={tag} className={blogTagToggleItemClass}>
                        {tag}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                )}
              </BlogTagFilter>

              <BlogPostListEmpty posts={posts} filteredPosts={filteredPosts} activeTag={activeTag}>
                {({ totalCount, activeTag: tag }) =>
                  totalCount === 0 ? (
                    <BlogEmptyState />
                  ) : (
                    <p className={fieldTypographyMuted}>
                      No posts tagged &ldquo;{tag}&rdquo;.{" "}
                      <a href="/blog" className={mdxLinkClass}>
                        View all
                      </a>
                    </p>
                  )
                }
              </BlogPostListEmpty>

              <BlogPostList posts={filteredPosts}>
                {({ posts: list }) => (
                  <div className="flex flex-col gap-8">
                    {list.map((post) => (
                      <BlogPostCard key={post.slug} post={post} />
                    ))}
                  </div>
                )}
              </BlogPostList>
            </BlogRoot>
          </div>
        </SiteLayout.Main>
        <SiteLayout.Footer />
      </SiteLayout.Frame>
    </SiteLayout.Root>
  );
}

if (typeof document !== "undefined") {
  const initialTag = new URLSearchParams(window.location.search).get("tag") ?? undefined;
  renderRoute(BlogPage, { initialTag });
}
