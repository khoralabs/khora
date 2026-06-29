import path from "node:path";
import { serve } from "bun";
import { serveBlogMedia } from "./lib/blog-media";
import { handleContactCancel, handleContactConfirm, handleContactQueue } from "./lib/contact-api";
import { ensureBlogManifest } from "./lib/ensure-blog-manifest";
import type { AppEvent } from "./lib/log-event";
import { logger } from "./lib/logger";
import { serveAssets } from "./lib/serve-assets";
import { serveDownloads } from "./lib/serve-downloads";
import { siteDiscoveryResponse, wantsSiteDiscoveryJson } from "./lib/site-discovery";
import { BlogPage } from "./routes/blog/client";
import blog from "./routes/blog/index.html";
import { BlogPostPage } from "./routes/blog/post/client";
import blogPost from "./routes/blog/post/index.html";
import { HomePage } from "./routes/client";
import { ContactPage } from "./routes/contact/client";
import contact from "./routes/contact/index.html";
import index from "./routes/index.html";
import { PrivacyPage } from "./routes/privacy/client";
import privacy from "./routes/privacy/index.html";
import { TermsPage } from "./routes/terms/client";
import terms from "./routes/terms/index.html";
import { blogPostHead } from "./ssr/blog-head";
import { type BunRouteRequest, type SsrServer, ssrRoute } from "./ssr/render-html-route";

await ensureBlogManifest();

const SSR_SHELL = "/__ssr-shell";

const shellRoutes = {
  [`${SSR_SHELL}/index`]: index,
  [`${SSR_SHELL}/blog`]: blog,
  [`${SSR_SHELL}/blog-post`]: blogPost,
  [`${SSR_SHELL}/contact`]: contact,
  [`${SSR_SHELL}/privacy`]: privacy,
  [`${SSR_SHELL}/terms`]: terms,
};

const homeSsrProps = (req: BunRouteRequest): { origin: string } => ({
  origin: new URL(req.url).origin,
});

const homePage = ssrRoute<{ origin: string }>(`${SSR_SHELL}/index`, HomePage, {
  props: homeSsrProps,
});

const htmlRoutes = {
  "/": {
    GET(req: BunRouteRequest, server: SsrServer) {
      if (wantsSiteDiscoveryJson(req)) {
        return siteDiscoveryResponse(new URL(req.url).origin);
      }
      return homePage.GET(req, server);
    },
  },
  "/consumer": homePage,
  "/*": homePage,
  "/join": ssrRoute(`${SSR_SHELL}/index`, HomePage),
  "/blog": ssrRoute(`${SSR_SHELL}/blog`, BlogPage, {
    props: (req) => ({
      initialTag: new URL(req.url).searchParams.get("tag") ?? undefined,
    }),
  }),
  "/blog/:slug": ssrRoute<{ slug: string }>(`${SSR_SHELL}/blog-post`, BlogPostPage, {
    props: (req) => ({ slug: req.params?.slug ?? "" }),
    head: (req) => blogPostHead(req.params?.slug ?? ""),
  }),
  "/contact": ssrRoute(`${SSR_SHELL}/contact`, ContactPage),
  "/privacy": ssrRoute(`${SSR_SHELL}/privacy`, PrivacyPage, {
    head: () => ({ title: "Privacy Policy — khora" }),
  }),
  "/terms": ssrRoute(`${SSR_SHELL}/terms`, TermsPage, {
    head: () => ({ title: "Terms of Service — khora" }),
  }),
};

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const AUTH_MD_PATH = path.join(import.meta.dir, "..", "public", "auth.md");

const server = serve({
  port: Number.isFinite(port) ? port : 3000,
  routes: {
    "/api/contact/queue": {
      POST: handleContactQueue,
    },
    "/api/contact/confirm": {
      POST: handleContactConfirm,
    },
    "/api/contact/queue/:id": {
      DELETE(req: BunRouteRequest) {
        return handleContactCancel(req, req.params?.id ?? "");
      },
    },
    "/api/events": {
      async POST(req) {
        try {
          const { event } = (await req.json()) as { event: AppEvent };
          logger.info({ event }, "app_event");
        } catch {
          return new Response(null, { status: 400 });
        }
        return new Response(null, { status: 204 });
      },
    },
    "/assets/*": { GET: serveAssets },
    "/blog/media/*": { GET: serveBlogMedia },
    "/downloads/*": { GET: serveDownloads },
    "/.well-known/khoralabs.json": {
      GET(req) {
        return siteDiscoveryResponse(new URL(req.url).origin);
      },
    },
    "/auth.md": {
      GET() {
        return new Response(Bun.file(AUTH_MD_PATH), {
          headers: { "Content-Type": "text/markdown; charset=utf-8" },
        });
      },
    },
    ...shellRoutes,
    ...htmlRoutes,
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },

  error(error) {
    console.error("[homepage] request error:", error);
    return new Response("Internal Server Error", { status: 500 });
  },
});

console.log(`🚀 Server running at ${server.url}`);
