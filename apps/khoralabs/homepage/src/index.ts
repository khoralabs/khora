import { serve } from "bun";
import { serveBlogMedia } from "./lib/blog-media.ts";
import blog from "./routes/blog/index.html";
import blogPost from "./routes/blog/post/index.html";
import contact from "./routes/contact/index.html";
import index from "./routes/index.html";
import privacy from "./routes/privacy/index.html";
import terms from "./routes/terms/index.html";

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
});

console.log(`🚀 Server running at ${server.url}`);
