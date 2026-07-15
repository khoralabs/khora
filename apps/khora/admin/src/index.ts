import adminPage from "./routes/admin/index.html";
import adminLoginPage from "./routes/admin/login/index.html";

function envPort(): number {
  const raw = process.env.PORT?.trim();
  if (raw === undefined || raw.length === 0) return 8789;
  const p = Number(raw);
  return Number.isFinite(p) && p > 0 ? Math.floor(p) : 8789;
}

function envHostOrigin(): string {
  const raw = process.env.KHORA_HOST_ORIGIN?.trim();
  if (raw !== undefined && raw.length > 0) return raw.replace(/\/$/, "");
  const hostPort = process.env.KHORA_HOST_PORT?.trim();
  const port =
    hostPort !== undefined && hostPort.length > 0 && Number.isFinite(Number(hostPort))
      ? Math.floor(Number(hostPort))
      : 8788;
  return `http://127.0.0.1:${port}`;
}

const hostOrigin = envHostOrigin();

const htmlRoutes = {
  "/admin": adminPage,
  "/admin/": adminPage,
  "/admin/network": adminPage,
  "/admin/network/*": adminPage,
  "/admin/infrastructure": adminPage,
  "/admin/infrastructure/*": adminPage,
  "/admin/operations": adminPage,
  "/admin/operations/*": adminPage,
  "/admin/registry": adminPage,
  "/admin/registry/*": adminPage,
  "/admin/lookup": adminPage,
  "/admin/lookup/*": adminPage,
  "/admin/graph": adminPage,
  "/admin/graph/*": adminPage,
  "/admin/login": adminLoginPage,
  "/admin/login/": adminLoginPage,
};

async function proxyAdminApi(req: Request, url: URL): Promise<Response> {
  const target = new URL(url.pathname + url.search, hostOrigin);
  const headers = new Headers(req.headers);
  headers.delete("host");
  return fetch(target, {
    method: req.method,
    headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer(),
    redirect: "manual",
  });
}

const server = Bun.serve({
  port: envPort(),
  routes: htmlRoutes,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/" || url.pathname === "") {
      return Response.redirect("/admin", 302);
    }
    if (url.pathname === "/admin/api" || url.pathname.startsWith("/admin/api/")) {
      return proxyAdminApi(req, url);
    }
    return new Response("Not found", { status: 404 });
  },
  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(
  `khora-admin listening on http://127.0.0.1:${server.port} (proxy /admin/api → ${hostOrigin})`,
);
