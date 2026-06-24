import { serve } from "bun";
import { createAuthzRoutes, dispatchAuthzRoute } from "./routes";
import { ensureAuthzServiceSchema } from "./schema";
import { createTursoDatabase } from "./sql";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} environment variable not set`);
  }
  return value;
}

const db = createTursoDatabase({
  url: requireEnv("TURSO_DATABASE_URL"),
  authToken: requireEnv("TURSO_AUTH_TOKEN"),
});
const token = requireEnv("AUTHZ_INTERNAL_TOKEN");
await ensureAuthzServiceSchema(db);

const routes = createAuthzRoutes(db, token);
const port = Number(process.env.PORT?.trim() || "3001");

serve({
  port,
  fetch: (req) => dispatchAuthzRoute(routes, req),
});

console.log(`authz service listening on ${port}`);
