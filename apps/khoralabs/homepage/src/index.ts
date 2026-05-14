import { serve } from "bun";
import contact from "./routes/contact/index.html";
import index from "./routes/index.html";

const server = serve({
  routes: {
    "/contact": contact,
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
