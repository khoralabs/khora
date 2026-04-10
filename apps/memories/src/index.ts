import { serve } from "bun";
import {
  buildNamespaceGraphLayout,
  loadEdgePreview,
  loadMemoryTextPreview,
  openMemoriesDatabaseReadonly,
} from "@cfd/memories";
import index from "./index.html";

const MEMORIES_DB_PATH = process.env.MEMORIES_DB_PATH?.trim();

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const server = serve({
  routes: {
    "/api/memory-preview": (req) => {
      if (req.method !== "GET") {
        return new Response("Method Not Allowed", { status: 405 });
      }
      const url = new URL(req.url);
      const namespace = url.searchParams.get("namespace")?.trim();
      const key = url.searchParams.get("key");
      if (!namespace || !key) {
        return jsonResponse({ error: "missing required query namespace and key" }, 400);
      }
      if (!MEMORIES_DB_PATH) {
        return jsonResponse(
          { error: "set MEMORIES_DB_PATH to your SQLite memories database file" },
          400,
        );
      }
      let db: ReturnType<typeof openMemoriesDatabaseReadonly>;
      try {
        db = openMemoriesDatabaseReadonly(MEMORIES_DB_PATH);
      } catch (err) {
        return jsonResponse({ error: `open database: ${String(err)}` }, 500);
      }
      try {
        const preview = loadMemoryTextPreview({ db }, namespace, key);
        return jsonResponse({ key, preview });
      } catch (err) {
        return jsonResponse({ error: String(err) }, 500);
      } finally {
        db.close();
      }
    },
    "/api/edge-preview": (req) => {
      if (req.method !== "GET") {
        return new Response("Method Not Allowed", { status: 405 });
      }
      const url = new URL(req.url);
      const namespace = url.searchParams.get("namespace")?.trim();
      const edgeId = url.searchParams.get("edgeId")?.trim();
      if (!namespace || !edgeId) {
        return jsonResponse({ error: "missing required query namespace and edgeId" }, 400);
      }
      if (!MEMORIES_DB_PATH) {
        return jsonResponse(
          { error: "set MEMORIES_DB_PATH to your SQLite memories database file" },
          400,
        );
      }
      let db: ReturnType<typeof openMemoriesDatabaseReadonly>;
      try {
        db = openMemoriesDatabaseReadonly(MEMORIES_DB_PATH);
      } catch (err) {
        return jsonResponse({ error: `open database: ${String(err)}` }, 500);
      }
      try {
        const detail = loadEdgePreview({ db }, namespace, edgeId);
        if (!detail) {
          return jsonResponse({ error: "edge not found in namespace" }, 404);
        }
        return jsonResponse(detail);
      } catch (err) {
        return jsonResponse({ error: String(err) }, 500);
      } finally {
        db.close();
      }
    },
    "/api/graph": (req) => {
      if (req.method !== "GET") {
        return new Response("Method Not Allowed", { status: 405 });
      }
      const url = new URL(req.url);
      const namespace = url.searchParams.get("namespace")?.trim();
      if (!namespace) {
        return jsonResponse({ error: "missing required query namespace" }, 400);
      }
      if (!MEMORIES_DB_PATH) {
        return jsonResponse(
          { error: "set MEMORIES_DB_PATH to your SQLite memories database file" },
          400,
        );
      }
      let db: ReturnType<typeof openMemoriesDatabaseReadonly>;
      try {
        db = openMemoriesDatabaseReadonly(MEMORIES_DB_PATH);
      } catch (err) {
        return jsonResponse({ error: `open database: ${String(err)}` }, 500);
      }
      try {
        const layout = buildNamespaceGraphLayout({ db }, namespace);
        return jsonResponse(layout);
      } catch (err) {
        return jsonResponse({ error: String(err) }, 500);
      } finally {
        db.close();
      }
    },
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
