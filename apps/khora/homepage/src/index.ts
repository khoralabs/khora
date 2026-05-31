import "./load-env";
import { buildRoutesFromMounts } from "@khoralabs/bun-web";
import { serve } from "bun";
import webUi from "../web-ui.config.ts";
import index from "./routes/index.html";
import login from "./routes/login/index.html";

const htmlRoutes = buildRoutesFromMounts(webUi.mounts, {
  index,
  login,
});

const port = Number.parseInt(process.env.PORT ?? "3000", 10);

const server = serve({
  port: Number.isFinite(port) ? port : 3000,
  routes: htmlRoutes,

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
