import { serve } from "bun";
import index from "./index.html";
import { inviteRequestSchema } from "./lib/invite-request.ts";
import { listPersonaPublicDtos } from "./lib/persona-public-dtos.ts";

const server = serve({
  routes: {
    "/api/personas": {
      GET: async () => Response.json(await listPersonaPublicDtos()),
    },
    "/api/invites": {
      POST: async (req) => {
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
        return Response.json({ ok: true as const });
      },
    },
    // Serve index.html for all unmatched routes.
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
