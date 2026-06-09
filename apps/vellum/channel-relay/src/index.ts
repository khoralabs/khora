import { createChannelRelayApp } from "./app";

const DEFAULT_PORT = 8790;

function envPort(): number {
  const raw = process.env.PORT?.trim();
  if (raw === undefined || raw.length === 0) return DEFAULT_PORT;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : DEFAULT_PORT;
}

const app = createChannelRelayApp();

const server = Bun.serve({
  port: envPort(),
  fetch(req, srv) {
    return app.fetch(req, srv);
  },
  websocket: app.websocket,
});

console.log(`vellum channel-relay listening on :${server.port}`);
