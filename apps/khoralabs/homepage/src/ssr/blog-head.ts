import { getPost } from "@khoralabs/blog";
import { blogPosts } from "@/generated/blog-manifest";
import type { PageHead } from "./render-html-route";

export function blogPostHead(slug: string): PageHead {
  const post = getPost(blogPosts, slug);
  if (!post) {
    return { title: "Post not found — khora" };
  }
  return {
    title: `${post.title} — khora`,
    description: post.description,
  };
}
