import { handleGetSession } from "./auth/session";
import { handleSignOut } from "./auth/sign-out";
import { handleAcceptInvite, handleGetInvite, handleMintInvite } from "./invites/routes";
import { handleGetMe, handlePatchMe, handlePostOnboarding } from "./onboarding/routes";
import { stubRegistryAuthRoutes } from "./registry-stub/routes";
import {
  handleCreateSession,
  handleGetInterview,
  handleGetSessionById,
  handleListSessions,
  handleListTeamMembers,
} from "./sessions/routes";
import {
  handleAcceptJoinTeam,
  handleCreateTeamInOrg,
  handleGetJoinTeam,
  handleMintTeamInvite,
} from "./teams/routes";

export const apiRoutes = {
  ...stubRegistryAuthRoutes,
  "/api/health": {
    GET: () => Response.json({ ok: true }),
  },

  "/api/auth/session": {
    GET: handleGetSession,
  },

  "/api/auth/sign-out": {
    POST: handleSignOut,
  },

  "/api/me": {
    GET: handleGetMe,
    PATCH: handlePatchMe,
  },

  "/api/onboarding": {
    POST: handlePostOnboarding,
  },

  "/api/orgs/:orgId/teams": {
    POST: (req: Request & { params: { orgId: string } }) =>
      handleCreateTeamInOrg(req, req.params.orgId),
  },

  "/api/sessions": {
    GET: handleListSessions,
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

  "/api/teams/:teamId/invites": {
    POST: (req: Request & { params: { teamId: string } }) =>
      handleMintTeamInvite(req, req.params.teamId),
  },

  "/api/teams/:teamId/members": {
    GET: (req: Request & { params: { teamId: string } }) =>
      handleListTeamMembers(req, req.params.teamId),
  },

  "/api/join-team/:token": {
    GET: (req: Request & { params: { token: string } }) => handleGetJoinTeam(req, req.params.token),
  },

  "/api/join-team/:token/accept": {
    POST: (req: Request & { params: { token: string } }) =>
      handleAcceptJoinTeam(req, req.params.token),
  },
} as const;
