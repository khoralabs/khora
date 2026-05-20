import { serve } from "bun";
import { handleInviteRequest } from "./api/invite.ts";
import blog from "./routes/blog/index.html";
import contact from "./routes/contact/index.html";
import index from "./routes/index.html";
import privacy from "./routes/privacy/index.html";
import terms from "./routes/terms/index.html";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);

const server = serve({
  port: Number.isFinite(port) ? port : 3000,
  routes: {
    "/api/invite": {
      POST: handleInviteRequest,
    },
    "/blog": blog,
    "/contact": contact,
    "/privacy": privacy,
    "/terms": terms,
    // Serve index.html for all unmatched routes.
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
