import { join } from "node:path";
import client from "./index.html";
import { inviteRequestSchema } from "./lib/invite-request.ts";
import { runMatchmakingSession } from "./lib/llm/session.ts";
import {
  appendDoneEvent,
  createThreadDevLog,
  getRun,
  readThreadJsonl,
  registerRun,
  setNegotiationServerRef,
} from "./lib/negotiation-run-registry.ts";
import { listPersonaPublicDtos } from "./lib/persona-public-dtos.ts";
import type { MatchmakingPersonaSlug } from "./lib/personas/index.ts";
import { buildIntroRequestScenarioPair } from "./lib/scenarios/intro-request.ts";

function requesterRequesteeForPersonaChoice(
  slug: MatchmakingPersonaSlug,
): readonly [MatchmakingPersonaSlug, MatchmakingPersonaSlug] {
  if (slug === "p1") {
    return ["p2", "p1"];
  }
  return ["p1", slug];
}

const server = Bun.serve({
  routes: {
    "/": client,
  },
  async fetch(req, ser): Promise<Response | undefined> {
    const url = new URL(req.url);

    if (url.pathname === "/api/negotiation/ws") {
      if (req.headers.get("upgrade") !== "websocket") {
        return new Response("Expected WebSocket", { status: 400 });
      }
      const runId = url.searchParams.get("runId");
      if (runId === null || getRun(runId) === undefined) {
        return new Response("Unknown run", { status: 400 });
      }
      const ok = ser.upgrade(req, { data: { runId } } as { data: { runId: string } });
      if (!ok) {
        return new Response("Upgrade failed", { status: 500 });
      }
      return;
    }

    if (url.pathname === "/api/personas" && req.method === "GET") {
      return Response.json(await listPersonaPublicDtos());
    }

    if (url.pathname === "/api/invites" && req.method === "POST") {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
      }
      const parsed = inviteRequestSchema.safeParse(body);
      if (!parsed.success) {
        return Response.json({ error: parsed.error.flatten() }, { status: 400 });
      }

      const runId = crypto.randomUUID();
      registerRun(runId);
      const [reqS, recS] = requesterRequesteeForPersonaChoice(parsed.data.personaSlug);
      const threadDev = createThreadDevLog(runId);

      void (async () => {
        try {
          const scenario = await buildIntroRequestScenarioPair(reqS, recS, {
            invitationMessage: parsed.data.message,
          });
          const result = await runMatchmakingSession({
            scenario,
            threadDevLog: threadDev,
            runId,
          });
          appendDoneEvent(runId, result);
        } catch (e) {
          appendDoneEvent(runId, {
            status: "error" as const,
            message: e instanceof Error ? e.message : String(e),
          });
        }
      })();

      return Response.json({ ok: true as const, runId });
    }

    if (url.pathname.startsWith("/api/")) {
      return new Response("Not found", { status: 404 });
    }

    const indexPath = join(import.meta.dir, "index.html");
    return new Response(Bun.file(indexPath), {
      headers: { "Content-Type": "text/html;charset=utf-8" },
    });
  },

  websocket: {
    idleTimeout: 300,
    data: {} as { runId: string },
    open(ws) {
      const { runId } = ws.data;
      ws.subscribe(runId);
      const text = readThreadJsonl(runId);
      for (const line of text.split("\n")) {
        const t = line.trim();
        if (t.length === 0) continue;
        try {
          const lineObj = JSON.parse(t) as Record<string, unknown>;
          if (
            lineObj &&
            typeof lineObj.memory_id === "string" &&
            typeof lineObj.source_key === "string" &&
            lineObj.kind === "string" &&
            typeof lineObj.string === "string"
          ) {
            ws.send(JSON.stringify({ t: "line", line: lineObj }));
          } else {
            ws.send(JSON.stringify({ t: "line", raw: t }));
          }
        } catch {
          ws.send(JSON.stringify({ t: "line", raw: t }));
        }
      }
    },
    message() {},
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

setNegotiationServerRef(server);

console.log(`🚀 Server running at ${server.url}`);
