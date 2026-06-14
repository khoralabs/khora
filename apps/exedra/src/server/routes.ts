import { handleGetSession } from "./auth/session";
import { handleAcceptInvite, handleGetInvite, handleMintInvite } from "./invites/routes";
import { stubRegistryAuthRoutes } from "./registry-stub/routes";
import { handleCreateSession, handleGetInterview, handleGetSessionById } from "./sessions/routes";

export const apiRoutes = {
  ...stubRegistryAuthRoutes,
  "/api/health": {
    GET: () => Response.json({ ok: true }),
  },

  "/api/auth/session": {
    GET: handleGetSession,
  },

  "/api/sessions": {
    POST: handleCreateSession,
  },

  "/api/sessions/:id": {
    GET: (req: Request & { params: { id: string } }) => handleGetSessionById(req, req.params.id),
  },

  "/api/sessions/:id/interview": {
    GET: (req: Request & { params: { id: string } }) => handleGetInterview(req, req.params.id),
  },

  "/api/sessions/:id/invites": {
    POST: (req: Request & { params: { id: string } }) => handleMintInvite(req, req.params.id),
  },

  "/api/invites/:token": {
    GET: (req: Request & { params: { token: string } }) => handleGetInvite(req, req.params.token),
  },

  "/api/invites/:token/accept": {
    POST: (req: Request & { params: { token: string } }) =>
      handleAcceptInvite(req, req.params.token),
  },
} as const;
