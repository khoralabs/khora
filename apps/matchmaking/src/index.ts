import { join } from "node:path";
import client from "./index.html";
import { getMatchmakingDomainRuntime } from "./lib/domain/runtime/index.ts";
import { extractAndPersistGoalsForInvite } from "./lib/goals/extract-and-persist-goals.ts";
import { inviteRequestSchema } from "./lib/invite-request.ts";
import { runMatchmakingSession } from "./lib/llm/session.ts";
import {
  appendDoneEvent,
  createThreadDevLog,
  getRun,
  readThreadJsonl,
  registerRun,
  setNegotiationServerRef,
  setRunMatchmakingContext,
} from "./lib/negotiation-run-registry.ts";
import { listPersonaPublicDtos } from "./lib/persona-public-dtos.ts";
import {
  mergePostMeetingReflectionToPartyKgs,
  mergePostNegotiationReviewToPartyKgs,
} from "./lib/post-negotiation-kg.ts";
import {
  postMeetingReflectionRequestSchema,
  postNegotiationReviewRequestSchema,
} from "./lib/post-negotiation-request.ts";
import { resolveMatchmakingSubjectId } from "./lib/resolve-subject-id.ts";
import { buildAppUserIntroRequestScenario } from "./lib/scenarios/intro-request.ts";
import { generateAndPersistRunSummaries } from "./lib/summaries/generate-and-persist-run-summaries.ts";
import { zRunSummariesApiResponse } from "./lib/summaries/summary-types.ts";
import {
  getUserPublicProfileForApi,
  saveUserPublicProfileToMemories,
  zUserPublicProfileBody,
} from "./lib/user-public-profile.ts";

/** Not a `MatchmakingPersonaSlug`; run context for post-negotiation merges (Party A = experiential user). */
const APP_USER_REQUESTER_SLUG = "_user_";

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

    if (url.pathname === "/api/me/public-profile" && req.method === "GET") {
      return Response.json(getUserPublicProfileForApi());
    }

    if (url.pathname === "/api/me/public-profile" && req.method === "PUT") {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
      }
      const parsed = zUserPublicProfileBody.safeParse(body);
      if (!parsed.success) {
        return Response.json({ error: parsed.error.flatten() }, { status: 400 });
      }
      try {
        await saveUserPublicProfileToMemories(parsed.data);
      } catch (e) {
        console.error("[me/public-profile] merge failed", e);
        return Response.json(
          { error: e instanceof Error ? e.message : "Could not save profile" },
          { status: 500 },
        );
      }
      return Response.json({ ok: true as const });
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
      const invitee = parsed.data.personaSlug;
      const threadDev = createThreadDevLog(runId);
      const subjectId = resolveMatchmakingSubjectId();
      getMatchmakingDomainRuntime().persistence.createInvite({
        id: runId,
        subjectId,
        inviteePersonaSlug: invitee,
        message: parsed.data.message,
      });
      void extractAndPersistGoalsForInvite({
        runId,
        subjectId,
        message: parsed.data.message,
      }).catch((e) => {
        console.error("[invite-goals] background extraction failed", e);
      });

      void (async () => {
        const p = getMatchmakingDomainRuntime().persistence;
        try {
          p.updateInviteStatus(runId, "negotiating");
          const scenario = await buildAppUserIntroRequestScenario(invitee, {
            invitationMessage: parsed.data.message,
          });
          setRunMatchmakingContext(runId, {
            partyMemoryNamespaces: scenario.partyMemoryNamespaces,
            requesterSlug: APP_USER_REQUESTER_SLUG,
            requesteeSlug: invitee,
          });
          const result = await runMatchmakingSession({
            scenario,
            threadDevLog: threadDev,
            runId,
          });
          appendDoneEvent(runId, result);
          p.setInviteFinished(runId, result);
          void generateAndPersistRunSummaries({ runId }).catch((e) => {
            console.error("[run-summaries] background generation failed", e);
          });
        } catch (e) {
          const err = {
            status: "error" as const,
            message: e instanceof Error ? e.message : String(e),
          };
          appendDoneEvent(runId, err);
          p.setInviteFinished(runId, err);
        }
      })();

      return Response.json({ ok: true as const, runId });
    }

    if (
      url.pathname.startsWith("/api/invites/") &&
      url.pathname.endsWith("/goals") &&
      req.method === "GET"
    ) {
      const runId = url.pathname
        .replace("/api/invites/", "")
        .replace("/goals", "")
        .replace(/\/+$/g, "");
      if (!runId) {
        return Response.json({ error: "Missing run id" }, { status: 400 });
      }
      const goals = getMatchmakingDomainRuntime().persistence.listGoalsByInviteId(runId);
      return Response.json({ goals });
    }

    if (
      url.pathname.startsWith("/api/runs/") &&
      url.pathname.endsWith("/summaries") &&
      req.method === "GET"
    ) {
      const runId = url.pathname
        .replace("/api/runs/", "")
        .replace("/summaries", "")
        .replace(/\/+$/g, "");
      if (!runId) {
        return Response.json({ error: "Missing run id" }, { status: 400 });
      }
      const summaries = getMatchmakingDomainRuntime()
        .persistence.listRunSummariesByRunId(runId)
        .map((s) => ({
          partySlug: s.partySlug,
          counterpartySlug: s.counterpartySlug,
          summaryText: s.summaryText,
          ...(s.fitAssessment !== undefined ? { fitAssessment: s.fitAssessment } : {}),
          keyEvidence: s.keyEvidence,
          ...(s.recommendedNextStep !== undefined
            ? { recommendedNextStep: s.recommendedNextStep }
            : {}),
        }));
      if (summaries.length < 2) {
        return Response.json(zRunSummariesApiResponse.parse({ status: "pending" }));
      }
      return Response.json(zRunSummariesApiResponse.parse({ status: "ready", summaries }));
    }

    if (url.pathname === "/api/post-negotiation/review" && req.method === "POST") {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
      }
      const parsed = postNegotiationReviewRequestSchema.safeParse(body);
      if (!parsed.success) {
        return Response.json({ error: parsed.error.flatten() }, { status: 400 });
      }
      if (getRun(parsed.data.runId) === undefined) {
        return Response.json({ error: "Unknown run" }, { status: 404 });
      }
      const runId = parsed.data.runId;
      const decision = parsed.data.decision;
      const trimmed = parsed.data.agentFeedback?.trim();
      const agentFeedback = trimmed !== undefined && trimmed.length > 0 ? trimmed : undefined;
      void mergePostNegotiationReviewToPartyKgs({
        runId,
        decision,
        ...(agentFeedback !== undefined ? { agentFeedback } : {}),
      }).catch((e) => {
        console.error("[post-negotiation/review] background merge failed", e);
      });
      return Response.json({ ok: true as const });
    }

    if (url.pathname === "/api/post-meeting-reflection" && req.method === "POST") {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
      }
      const parsed = postMeetingReflectionRequestSchema.safeParse(body);
      if (!parsed.success) {
        return Response.json({ error: parsed.error.flatten() }, { status: 400 });
      }
      if (getRun(parsed.data.runId) === undefined) {
        return Response.json({ error: "Unknown run" }, { status: 404 });
      }
      const text = parsed.data.text.trim();
      if (text.length === 0) {
        return Response.json({ error: "Reflection text is empty" }, { status: 400 });
      }
      const runId = parsed.data.runId;
      const goalsSnapshot = getMatchmakingDomainRuntime()
        .persistence.listGoalsByInviteId(runId)
        .map((g) => g.text);
      void mergePostMeetingReflectionToPartyKgs({
        runId,
        text,
        ...(goalsSnapshot.length > 0 ? { goalsSnapshot } : {}),
      }).catch((e) => {
        console.error("[post-meeting-reflection] background merge failed", e);
      });
      return Response.json({ ok: true as const });
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
