import * as bilateralScenario from "./scenarios/bilateral/scenario.ts";
import * as intentOverlapScenario from "./scenarios/intent-overlap/scenario.ts";
import {
  createNegotiationScenarioSession,
  type NegotiationScenarioSession,
  type ScenarioNegotiationCopy,
} from "./shared/negotiation-scenario-session.ts";
import homeHtml from "./routes/index.html";
import bilateralHtml from "./scenarios/bilateral/index.html";
import intentOverlapHtml from "./scenarios/intent-overlap/index.html";

const SCENARIO_MODULES: Record<string, ScenarioNegotiationCopy> = {
  bilateral: bilateralScenario,
  "intent-overlap": intentOverlapScenario,
};

const sessions = new Map<string, NegotiationScenarioSession>();

function getSession(slug: string): NegotiationScenarioSession | null {
  const mod = SCENARIO_MODULES[slug];
  if (mod === undefined) {
    return null;
  }
  let s = sessions.get(slug);
  if (s === undefined) {
    s = createNegotiationScenarioSession(mod);
    sessions.set(slug, s);
  }
  return s;
}

function parseScenarioApi(pathname: string):
  | { slug: string; action: "health" | "state" | "turn" | "reset" }
  | null {
  const prefix = "/api/scenarios/";
  if (!pathname.startsWith(prefix)) {
    return null;
  }
  const tail = pathname.slice(prefix.length);
  const segments = tail.split("/").filter(Boolean);
  if (segments.length < 2) {
    return null;
  }
  const slug = segments[0];
  if (slug === undefined || SCENARIO_MODULES[slug] === undefined) {
    return null;
  }
  const a = segments[1];
  const b = segments[2];
  if (a === "health" && segments.length === 2) {
    return { slug, action: "health" };
  }
  if (a === "state" && segments.length === 2) {
    return { slug, action: "state" };
  }
  if (a === "negotiation" && b === "turn" && segments.length === 3) {
    return { slug, action: "turn" };
  }
  if (a === "negotiation" && b === "reset" && segments.length === 3) {
    return { slug, action: "reset" };
  }
  return null;
}

const firstActor: "buyer" | "seller" =
  process.env.NEGOTIATION_FIRST?.trim().toLowerCase() === "buyer" ? "buyer" : "seller";

const server = Bun.serve({
  port: Number(process.env.PORT) || 3456,
  routes: {
    "/": homeHtml,
    "/scenarios/bilateral": bilateralHtml,
    "/scenarios/intent-overlap": intentOverlapHtml,
  },
  async fetch(req): Promise<Response> {
    const url = new URL(req.url);
    const parsed = parseScenarioApi(url.pathname);
    if (parsed !== null) {
      const session = getSession(parsed.slug);
      if (session === null) {
        return new Response("Not found", { status: 404 });
      }
      if (parsed.action === "health" && req.method === "GET") {
        return session.handleHealth();
      }
      if (parsed.action === "state" && req.method === "GET") {
        return session.handleState();
      }
      if (parsed.action === "turn" && req.method === "POST") {
        return session.handleTurn(req);
      }
      if (parsed.action === "reset" && req.method === "POST") {
        return session.handleReset();
      }
      return new Response("Method not allowed", { status: 405 });
    }

    return new Response("Not found", { status: 404 });
  },
  development: {
    hmr: true,
    console: true,
  },
});

const origin = `http://localhost:${server.port}`;
console.log(`OBP examples home: ${origin}/`);
console.log(`  Bilateral pilot: ${origin}/scenarios/bilateral`);
console.log(`  Intent overlap:  ${origin}/scenarios/intent-overlap`);
console.log(`NEGOTIATION_FIRST=${firstActor}`);
