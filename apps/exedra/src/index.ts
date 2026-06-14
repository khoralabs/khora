import { serve } from "bun";
import index from "./client/index.html";

const server = serve({
  routes: {
    "/*": index,

    "/api/health": {
      GET: () => Response.json({ ok: true }),
    },
  },

  websocket: {
    open(ws) {
      console.log("ws open", ws.remoteAddress);
    },
    message(ws, data) {
      // TODO: route by ws.data.kind: "interview" | "alignment"
      console.log("ws message", data);
    },
    close(ws) {
      console.log("ws close");
    },
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`Exedra running at ${server.url}`);
