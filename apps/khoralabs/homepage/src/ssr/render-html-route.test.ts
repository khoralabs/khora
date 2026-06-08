import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { serve } from "bun";
import { blogPosts } from "@/generated/blog-manifest";
import { BlogPage } from "@/routes/blog/client";
import { BlogPostPage } from "@/routes/blog/post/client";
import { ContactPage } from "@/routes/contact/client";
import { PrivacyPage } from "@/routes/privacy/client";
import { blogPostHead } from "./blog-head";
import { renderHtmlRoute } from "./render-html-route";

const shellHtml =
  '<!doctype html><html><head><title>khora</title></head><body><div id="root"></div></body></html>';

let shellServer: ReturnType<typeof serve>;

beforeAll(() => {
  shellServer = serve({
    port: 0,
    routes: {
      "/shell": () => new Response(shellHtml, { headers: { "Content-Type": "text/html" } }),
    },
  });
});

afterAll(() => {
  shellServer.stop();
});

describe("renderHtmlRoute", () => {
  test("renders contact page content into #root", async () => {
    const req = new Request("http://localhost/contact");
    const res = await renderHtmlRoute(req, shellServer, "/shell", ContactPage);
    const html = await res.text();

    expect(html).toContain('<div id="root">');
    expect(html).not.toContain('<div id="root"></div>');
    expect(html).toContain("Contact");
  });

  test("renders privacy MDX content on SSR", async () => {
    const req = new Request("http://localhost/privacy");
    const res = await renderHtmlRoute(
      req,
      shellServer,
      "/shell",
      PrivacyPage,
      {},
      {
        title: "Privacy Policy — khora",
      },
    );
    const html = await res.text();

    expect(html).toContain("Khora Privacy Policy");
    expect(html).toContain("<title>Privacy Policy — khora</title>");
  });

  test("patches title from head option", async () => {
    const req = new Request("http://localhost/contact");
    const res = await renderHtmlRoute(
      req,
      shellServer,
      "/shell",
      ContactPage,
      {},
      {
        title: "Contact — khora",
      },
    );
    const html = await res.text();

    expect(html).toContain("<title>Contact — khora</title>");
  });

  test("renders blog post title for known slug", async () => {
    const post = blogPosts[0];
    if (!post) return;

    const req = new Request(`http://localhost/blog/${post.slug}`);
    const res = await renderHtmlRoute(
      req,
      shellServer,
      "/shell",
      BlogPostPage,
      { slug: post.slug },
      blogPostHead(post.slug),
    );
    const html = await res.text();

    expect(html).toContain(post.title);
    expect(html).toContain(`<title>${post.title} — khora</title>`);
  });

  test("renders not found for unknown slug", async () => {
    const req = new Request("http://localhost/blog/missing-slug");
    const res = await renderHtmlRoute(req, shellServer, "/shell", BlogPostPage, {
      slug: "missing-slug",
    });
    const html = await res.text();

    expect(html).toContain("Post not found");
  });

  test("filters blog index by tag on SSR", async () => {
    const post = blogPosts.find((p) => p.tags.length > 0);
    if (!post) return;

    const tag = post.tags[0];
    const req = new Request(`http://localhost/blog?tag=${encodeURIComponent(tag ?? "")}`);
    const res = await renderHtmlRoute(req, shellServer, "/shell", BlogPage, { initialTag: tag });
    const html = await res.text();

    expect(html).toContain(post.title);
    const other = blogPosts.find((p) => p.slug !== post.slug && !p.tags.includes(tag ?? ""));
    if (other) {
      expect(html).not.toContain(other.title);
    }
  });
});

describe("blogPostHead", () => {
  test("returns not found title for unknown slug", () => {
    expect(blogPostHead("does-not-exist").title).toBe("Post not found — khora");
  });
});
