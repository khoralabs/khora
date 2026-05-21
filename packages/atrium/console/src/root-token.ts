import {
  clearSessionCookie,
  issueSessionCookie,
  readSessionPrincipal,
  tokensEqual,
} from "./session-cookie.ts";
import type { ConsoleAuth, ConsolePrincipal } from "./types.ts";

export type RootTokenConsoleAuthOptions = {
  rootToken: string;
};

export function createRootTokenConsoleAuth(options: RootTokenConsoleAuthOptions): ConsoleAuth {
  const { rootToken } = options;

  return {
    async authenticate(req: Request): Promise<ConsolePrincipal | null> {
      return readSessionPrincipal(req, rootToken);
    },

    async route(req: Request, url: URL): Promise<Response | undefined> {
      if (url.pathname === "/admin/api/login" && req.method === "POST") {
        let body: { token?: string };
        try {
          body = (await req.json()) as { token?: string };
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }
        const token = typeof body.token === "string" ? body.token : "";
        if (token.length === 0 || !tokensEqual(token, rootToken)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": issueSessionCookie(rootToken),
          },
        });
      }

      if (url.pathname === "/admin/api/logout" && req.method === "POST") {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": clearSessionCookie(),
          },
        });
      }

      if (url.pathname === "/admin/api/session" && req.method === "GET") {
        const principal = readSessionPrincipal(req, rootToken);
        if (principal === null) {
          return Response.json({ authenticated: false }, { status: 401 });
        }
        return Response.json({ authenticated: true, principal });
      }

      return undefined;
    },
  };
}
