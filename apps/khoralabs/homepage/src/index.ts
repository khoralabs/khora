import { serve } from "bun";
import { serveBlogMedia } from "./lib/blog-media";
import { ensureBlogManifest } from "./lib/ensure-blog-manifest";
import { serveDownloads } from "./lib/serve-downloads";
import blog from "./routes/blog/index.html";
import blogPost from "./routes/blog/post/index.html";
import contact from "./routes/contact/index.html";
import index from "./routes/index.html";
import privacy from "./routes/privacy/index.html";
import skills from "./routes/skills/index.html";
import terms from "./routes/terms/index.html";

await ensureBlogManifest();

const htmlRoutes = {
  "/consumer": index,
  "/*": index,
  "/blog": blog,
  "/blog/:slug": blogPost,
  "/contact": contact,
  "/join": index,
  "/privacy": privacy,
  "/skills": skills,
  "/terms": terms,
};

const port = Number.parseInt(process.env.PORT ?? "3000", 10);

const server = serve({
  port: Number.isFinite(port) ? port : 3000,
  routes: {
    "/blog/media/*": { GET: serveBlogMedia },
    "/downloads/*": { GET: serveDownloads },
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
