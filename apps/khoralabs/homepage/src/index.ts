import { serve } from "bun";
import { serveBlogMedia } from "./lib/blog-media";
import { ensureBlogManifest } from "./lib/ensure-blog-manifest";

await ensureBlogManifest();

const [
  { default: blog },
  { default: blogPost },
  { default: contact },
  { default: index },
  { default: privacy },
  { default: terms },
] = await Promise.all([
  import("./routes/blog/index.html"),
  import("./routes/blog/post/index.html"),
  import("./routes/contact/index.html"),
  import("./routes/index.html"),
  import("./routes/privacy/index.html"),
  import("./routes/terms/index.html"),
]);

const port = Number.parseInt(process.env.PORT ?? "3000", 10);

const server = serve({
  port: Number.isFinite(port) ? port : 3000,
  routes: {
    "/blog": blog,
    "/blog/media/*": { GET: serveBlogMedia },
    "/blog/:slug": blogPost,
    "/contact": contact,
    "/consumer": index,
    "/privacy": privacy,
    "/terms": terms,
    "/*": index,
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
