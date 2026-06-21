import {
  BlogPostList,
  BlogPostListEmpty,
  BlogRoot,
  BlogTagFilter,
  useBlogManifest,
} from "@khoralabs/blog/react";
import { ArrowUpRight, Newspaper } from "lucide-react";

import { BlogPostCard } from "@/components/blog-post-card";
import { MutedBody } from "@/components/muted-body";
import { PageTitle } from "@/components/page-title";
import { ShellLink } from "@/components/shell-link";
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
import { renderRoute } from "../../render-route";
import "../../../styles/globals.css";

function BlogEmptyState() {
  return (
    <Empty className="max-w-xl border border-[#F4F4EF]/20 bg-[#F4F4EF]/[0.04] text-[#F4F4EF]">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="bg-[#F4F4EF]/12 text-[#F4F4EF]">
          <Newspaper />
        </EmptyMedia>
        <EmptyTitle className="text-[#F4F4EF]">No posts yet</EmptyTitle>
        <EmptyDescription className="text-[#F4F4EF]/75">
          Writing from the lab will land here. Until then, reach out if you&apos;d like to
          collaborate.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row justify-center gap-2">
        <Button variant="shell" asChild>
          <a href="/contact">Get in touch</a>
        </Button>
        <Button variant="shell-outline" asChild>
          <a href="/">Home</a>
        </Button>
      </EmptyContent>
      <Button variant="shell-link" asChild size="sm">
        <a href="/contact" aria-label="Learn more about Khora">
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
            <PageTitle className="mb-2">Blog</PageTitle>
            <MutedBody className="mb-8">
              Updates from the lab on products, engineering, and preview releases.
            </MutedBody>

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
                    <ToggleGroupItem
                      value="all"
                      className="border-[#F4F4EF]/25 bg-transparent text-sm text-[#F4F4EF] hover:bg-[#F4F4EF]/10 hover:text-[#F4F4EF] data-[state=on]:border-[#F4F4EF]/50 data-[state=on]:bg-[#F4F4EF]/10 data-[state=on]:text-[#F4F4EF]"
                    >
                      All
                    </ToggleGroupItem>
                    {tagList.map((tag) => (
                      <ToggleGroupItem
                        key={tag}
                        value={tag}
                        className="border-[#F4F4EF]/25 bg-transparent text-sm text-[#F4F4EF] hover:bg-[#F4F4EF]/10 hover:text-[#F4F4EF] data-[state=on]:border-[#F4F4EF]/50 data-[state=on]:bg-[#F4F4EF]/10 data-[state=on]:text-[#F4F4EF]"
                      >
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
                    <MutedBody>
                      No posts tagged &ldquo;{tag}&rdquo;.{" "}
                      <ShellLink href="/blog">View all</ShellLink>
                    </MutedBody>
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
