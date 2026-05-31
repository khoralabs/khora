import { buildRoutesFromMounts } from "@khoralabs/bun-web";
import { serve } from "bun";
import webUi from "../web-ui.config.ts";
import { serveBlogMedia } from "./lib/blog-media";
import { ensureBlogManifest } from "./lib/ensure-blog-manifest";
import blog from "./routes/blog/index.html";
import blogPost from "./routes/blog/post/index.html";
import contact from "./routes/contact/index.html";
import index from "./routes/index.html";
import join from "./routes/join/index.html";
import privacy from "./routes/privacy/index.html";
import terms from "./routes/terms/index.html";

await ensureBlogManifest();

const htmlRoutes = buildRoutesFromMounts(webUi.mounts, {
  blog,
  blogPost,
  contact,
  index,
  join,
  privacy,
  terms,
});

const port = Number.parseInt(process.env.PORT ?? "3000", 10);

const server = serve({
  port: Number.isFinite(port) ? port : 3000,
  routes: {
    "/blog/media/*": { GET: serveBlogMedia },
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
