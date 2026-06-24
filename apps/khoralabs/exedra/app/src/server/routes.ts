import { handleGetSession } from "./auth/session";
import { handleSignOut } from "./auth/sign-out";
import { handleInternalAuthzDecide } from "./authz/internal-routes";
import {
  handleGetOrgMemberPermissions,
  handleGetTeamPermissions,
  handlePatchOrgMemberPermissions,
  handlePatchTeamPermissions,
} from "./authz/routes";
import { handleServeAvatar } from "./avatars/routes";
import {
  handleInternalAbortChatPostStream,
  handleInternalApplyChatPostDelta,
  handleInternalCompleteChatPostStream,
  handleInternalStartStreamedChatPost,
} from "./chat/internal-routes";
import {
  handleAppendChatPost,
  handleChatBootstrap,
  handleChatThreadEvents,
  handleGetChatChannel,
  handleListChatPosts,
  handleListChatThreads,
} from "./chat/routes";
import { handleContributeDocuments, handleGetDocumentBatch } from "./documents/contribute-routes";
import {
  handleGetSessionDocument,
  handleListSessionDocuments,
  handleUploadSessionDocument,
} from "./documents/routes";
import {
  handleInternalDeleteDocumentMemories,
  handleInternalGetDocument,
  handleInternalGetDocumentBatch,
  handleInternalGetDocumentBytes,
  handleInternalPatchDocument,
} from "./http/internal-documents";
import {
  handleInternalMemoriesAgentSearch,
  handleInternalMemoriesMerge,
  handleInternalMemoriesMergeDocumentChunk,
  handleInternalMemoriesProvenanceHead,
  handleInternalMemoriesSearch,
} from "./http/internal-memories";
import { handleAcceptInvite, handleGetInvite, handleMintInvite } from "./invites/routes";
import {
  handleDeleteJob,
  handleGetJob,
  handleGetJobStream,
  handleInternalAppendJobEvents,
  handleInternalCompleteJob,
  handleInternalFailJob,
} from "./jobs/routes";
import {
  handleMeMemoriesEdgePreview,
  handleMeMemoriesGraph,
  handleMeMemoriesNamespaces,
  handleMeMemoriesSearch,
} from "./memories/me-routes";
import {
  handleOrgMemoriesEdgePreview,
  handleOrgMemoriesGraph,
  handleOrgMemoriesNamespaces,
  handleOrgMemoriesSearch,
} from "./memories/org-routes";
import {
  handleUserMemoriesEdgePreview,
  handleUserMemoriesGraph,
  handleUserMemoriesNamespaces,
  handleUserMemoriesSearch,
} from "./memories/user-routes";
import {
  handleDeleteMeAvatar,
  handleGetMe,
  handlePatchMe,
  handlePostOnboarding,
  handleUploadMeAvatar,
} from "./onboarding/routes";
import {
  handleDeleteOrgAvatar,
  handleGetOrgMember,
  handleGetOrgSettings,
  handleListOrgMembers,
  handleListOrgTeams,
  handlePatchOrg,
  handleUploadOrgAvatar,
} from "./orgs/routes";
import { stubRegistryAuthRoutes } from "./registry-stub/routes";
import {
  handleCreateSession,
  handleGetFacilitation,
  handleGetInterview,
  handleGetParticipantInterview,
  handleGetSessionAccess,
  handleGetSessionById,
  handleInterviewOptIn,
  handleListSessions,
  handleListTeamMembers,
  handleManageSessionScopes,
  handlePatchBeliefFeedback,
  handlePatchSession,
  handlePatchSessionAccess,
} from "./sessions/routes";
import {
  handleJoinNetwork,
  handleJoinOrgNetwork,
  handleMarketingOptIn,
} from "./settings/network-routes";
import { handleAcceptTerms } from "./settings/terms-routes";
import {
  handleCreateTeamInOrg,
  handleDeleteTeamAvatar,
  handleGetTeamSettings,
  handleMintTeamInvite,
  handlePatchTeam,
  handleUploadTeamAvatar,
} from "./teams/routes";
import { handlePostClientEvent } from "./telemetry/events-route";
import { handleHealth, handleReady } from "./telemetry/health";

export const apiRoutes = {
  ...stubRegistryAuthRoutes,
  "/api/health": {
    GET: handleHealth,
  },

  "/api/health/ready": {
    GET: handleReady,
  },

  "/api/events": {
    POST: handlePostClientEvent,
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

  "/api/me/avatar": {
    POST: handleUploadMeAvatar,
    DELETE: handleDeleteMeAvatar,
  },

  "/api/me/terms-accept": {
    POST: handleAcceptTerms,
  },

  "/api/me/join-network": {
    POST: handleJoinNetwork,
  },

  "/api/me/marketing-opt-in": {
    POST: handleMarketingOptIn,
  },

  "/api/onboarding": {
    POST: handlePostOnboarding,
  },

  "/api/orgs/:orgId": {
    PATCH: (req: Request & { params: { orgId: string } }) => handlePatchOrg(req, req.params.orgId),
  },

  "/api/orgs/:orgId/settings": {
    GET: (req: Request & { params: { orgId: string } }) =>
      handleGetOrgSettings(req, req.params.orgId),
  },

  "/api/orgs/:orgId/members": {
    GET: (req: Request & { params: { orgId: string } }) =>
      handleListOrgMembers(req, req.params.orgId),
  },

  "/api/orgs/:orgId/members/:userId": {
    GET: (req: Request & { params: { orgId: string; userId: string } }) =>
      handleGetOrgMember(req, req.params.orgId, req.params.userId),
  },

  "/api/orgs/:orgId/members/:userId/permissions": {
    GET: (req: Request & { params: { orgId: string; userId: string } }) =>
      handleGetOrgMemberPermissions(req, req.params.orgId, req.params.userId),
    PATCH: (req: Request & { params: { orgId: string; userId: string } }) =>
      handlePatchOrgMemberPermissions(req, req.params.orgId, req.params.userId),
  },

  "/api/orgs/:orgId/teams": {
    GET: (req: Request & { params: { orgId: string } }) =>
      handleListOrgTeams(req, req.params.orgId),
    POST: (req: Request & { params: { orgId: string } }) =>
      handleCreateTeamInOrg(req, req.params.orgId),
  },

  "/api/orgs/:orgId/avatar": {
    POST: (req: Request & { params: { orgId: string } }) =>
      handleUploadOrgAvatar(req, req.params.orgId),
    DELETE: (req: Request & { params: { orgId: string } }) =>
      handleDeleteOrgAvatar(req, req.params.orgId),
  },

  "/api/orgs/:orgId/join-network": {
    POST: (req: Request & { params: { orgId: string } }) =>
      handleJoinOrgNetwork(req, req.params.orgId),
  },

  "/api/sessions": {
    GET: handleListSessions,
    POST: handleCreateSession,
  },

  "/api/sessions/:id": {
    GET: (req: Request & { params: { id: string } }) => handleGetSessionById(req, req.params.id),
    PATCH: (req: Request & { params: { id: string } }) => handlePatchSession(req, req.params.id),
  },

  "/api/sessions/:id/access": {
    GET: (req: Request & { params: { id: string } }) => handleGetSessionAccess(req, req.params.id),
    PATCH: (req: Request & { params: { id: string } }) =>
      handlePatchSessionAccess(req, req.params.id),
  },

  "/api/sessions/:id/scopes": {
    POST: (req: Request & { params: { id: string } }) =>
      handleManageSessionScopes(req, req.params.id),
  },

  "/api/sessions/:id/interview": {
    GET: (req: Request & { params: { id: string } }) => handleGetInterview(req, req.params.id),
  },

  "/api/sessions/:id/chat/bootstrap": {
    GET: (req: Request & { params: { id: string } }) => handleChatBootstrap(req, req.params.id),
  },

  "/api/chat/threads/:id/posts": {
    GET: (req: Request & { params: { id: string } }) => handleListChatPosts(req, req.params.id),
    POST: (req: Request & { params: { id: string } }) => handleAppendChatPost(req, req.params.id),
  },

  "/api/chat/threads/:id/events": {
    GET: (req: Request & { params: { id: string } }) => handleChatThreadEvents(req, req.params.id),
  },

  "/api/chat/channels/:id": {
    GET: (req: Request & { params: { id: string } }) => handleGetChatChannel(req, req.params.id),
  },

  "/api/chat/channels/:id/threads": {
    GET: (req: Request & { params: { id: string } }) => handleListChatThreads(req, req.params.id),
  },

  "/api/sessions/:id/interview/opt-in": {
    POST: (req: Request & { params: { id: string } }) => handleInterviewOptIn(req, req.params.id),
  },

  "/api/sessions/:id/facilitation": {
    GET: (req: Request & { params: { id: string } }) => handleGetFacilitation(req, req.params.id),
  },

  "/api/sessions/:sessionId/participants/:userId/interview": {
    GET: (req: Request & { params: { sessionId: string; userId: string } }) =>
      handleGetParticipantInterview(req, req.params.sessionId, req.params.userId),
  },

  "/api/sessions/:sessionId/interview/beliefs/:beliefId": {
    PATCH: (req: Request & { params: { sessionId: string; beliefId: string } }) =>
      handlePatchBeliefFeedback(req, req.params.sessionId, req.params.beliefId),
  },

  "/api/sessions/:sessionId/documents": {
    GET: (req: Request & { params: { sessionId: string } }) =>
      handleListSessionDocuments(req, req.params.sessionId),
    POST: (req: Request & { params: { sessionId: string } }) =>
      handleUploadSessionDocument(req, req.params.sessionId),
  },

  "/api/sessions/:sessionId/documents/:documentId": {
    GET: (req: Request & { params: { sessionId: string; documentId: string } }) =>
      handleGetSessionDocument(req, req.params.sessionId, req.params.documentId),
  },

  "/api/documents/contribute": {
    POST: (req: Request) => handleContributeDocuments(req),
  },

  "/api/documents/batches/:batchId": {
    GET: (req: Request & { params: { batchId: string } }) =>
      handleGetDocumentBatch(req, req.params.batchId),
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

  "/api/teams/:teamId/settings": {
    GET: (req: Request & { params: { teamId: string } }) =>
      handleGetTeamSettings(req, req.params.teamId),
  },

  "/api/teams/:teamId": {
    PATCH: (req: Request & { params: { teamId: string } }) =>
      handlePatchTeam(req, req.params.teamId),
  },

  "/api/teams/:teamId/avatar": {
    POST: (req: Request & { params: { teamId: string } }) =>
      handleUploadTeamAvatar(req, req.params.teamId),
    DELETE: (req: Request & { params: { teamId: string } }) =>
      handleDeleteTeamAvatar(req, req.params.teamId),
  },

  "/api/teams/:teamId/members": {
    GET: (req: Request & { params: { teamId: string } }) =>
      handleListTeamMembers(req, req.params.teamId),
  },

  "/api/teams/:teamId/permissions": {
    GET: (req: Request & { params: { teamId: string } }) =>
      handleGetTeamPermissions(req, req.params.teamId),
    PATCH: (req: Request & { params: { teamId: string } }) =>
      handlePatchTeamPermissions(req, req.params.teamId),
  },

  "/api/memories/org/:orgId/namespaces": {
    GET: (req: Request & { params: { orgId: string } }) =>
      handleOrgMemoriesNamespaces(req, req.params.orgId),
  },

  "/api/memories/org/:orgId/graph": {
    GET: (req: Request & { params: { orgId: string } }) =>
      handleOrgMemoriesGraph(req, req.params.orgId),
  },

  "/api/memories/org/:orgId/edge-preview": {
    GET: (req: Request & { params: { orgId: string } }) =>
      handleOrgMemoriesEdgePreview(req, req.params.orgId),
  },

  "/api/memories/org/:orgId/search": {
    POST: (req: Request & { params: { orgId: string } }) =>
      handleOrgMemoriesSearch(req, req.params.orgId),
  },

  "/api/memories/me/namespaces": {
    GET: handleMeMemoriesNamespaces,
  },

  "/api/memories/me/graph": {
    GET: handleMeMemoriesGraph,
  },

  "/api/memories/me/edge-preview": {
    GET: handleMeMemoriesEdgePreview,
  },

  "/api/memories/me/search": {
    POST: handleMeMemoriesSearch,
  },

  "/api/memories/users/:ownerId/namespaces": {
    GET: (req: Request & { params: { ownerId: string } }) =>
      handleUserMemoriesNamespaces(req, req.params.ownerId),
  },

  "/api/memories/users/:ownerId/graph": {
    GET: (req: Request & { params: { ownerId: string } }) =>
      handleUserMemoriesGraph(req, req.params.ownerId),
  },

  "/api/memories/users/:ownerId/edge-preview": {
    GET: (req: Request & { params: { ownerId: string } }) =>
      handleUserMemoriesEdgePreview(req, req.params.ownerId),
  },

  "/api/memories/users/:ownerId/search": {
    POST: (req: Request & { params: { ownerId: string } }) =>
      handleUserMemoriesSearch(req, req.params.ownerId),
  },

  "/api/avatars/:kind/:id": {
    GET: (req: Request & { params: { kind: string; id: string } }) =>
      handleServeAvatar(req, req.params.kind, req.params.id),
  },

  "/api/jobs/:jobId/stream": {
    GET: (req: Request & { params: { jobId: string } }) =>
      handleGetJobStream(req, req.params.jobId),
  },

  "/api/jobs/:jobId": {
    GET: (req: Request & { params: { jobId: string } }) => handleGetJob(req, req.params.jobId),
    DELETE: (req: Request & { params: { jobId: string } }) =>
      handleDeleteJob(req, req.params.jobId),
  },
} as const;

export const internalRoutes = {
  "/internal/authz/decide": {
    POST: handleInternalAuthzDecide,
  },

  "/internal/memories/search": {
    POST: handleInternalMemoriesSearch,
  },

  "/internal/memories/agent-search": {
    POST: handleInternalMemoriesAgentSearch,
  },

  "/internal/memories/provenance-head": {
    GET: handleInternalMemoriesProvenanceHead,
  },

  "/internal/memories/merge": {
    POST: handleInternalMemoriesMerge,
  },

  "/internal/memories/merge-document-chunk": {
    POST: handleInternalMemoriesMergeDocumentChunk,
  },

  "/internal/documents/batches/:batchId": {
    GET: (req: Request & { params: { batchId: string } }) =>
      handleInternalGetDocumentBatch(req, req.params.batchId),
  },

  "/internal/documents/:documentId": {
    GET: (req: Request & { params: { documentId: string } }) =>
      handleInternalGetDocument(req, req.params.documentId),
    PATCH: (req: Request & { params: { documentId: string } }) =>
      handleInternalPatchDocument(req, req.params.documentId),
  },

  "/internal/documents/:documentId/bytes": {
    GET: (req: Request & { params: { documentId: string } }) =>
      handleInternalGetDocumentBytes(req, req.params.documentId),
  },

  "/internal/documents/:documentId/memories": {
    DELETE: (req: Request & { params: { documentId: string } }) =>
      handleInternalDeleteDocumentMemories(req, req.params.documentId),
  },

  "/internal/jobs/:jobId/events": {
    POST: (req: Request & { params: { jobId: string } }) =>
      handleInternalAppendJobEvents(req, req.params.jobId),
  },

  "/internal/jobs/:jobId/complete": {
    POST: (req: Request & { params: { jobId: string } }) =>
      handleInternalCompleteJob(req, req.params.jobId),
  },

  "/internal/jobs/:jobId/fail": {
    POST: (req: Request & { params: { jobId: string } }) =>
      handleInternalFailJob(req, req.params.jobId),
  },

  "/internal/chat/threads/:threadId/streamed-posts": {
    POST: (req: Request & { params: { threadId: string } }) =>
      handleInternalStartStreamedChatPost(req, req.params.threadId),
  },

  "/internal/chat/streamed-posts": {
    POST: (req: Request) => handleInternalStartStreamedChatPost(req),
  },

  "/internal/chat/posts/:postId/deltas": {
    POST: (req: Request & { params: { postId: string } }) =>
      handleInternalApplyChatPostDelta(req, req.params.postId),
  },

  "/internal/chat/posts/:postId/complete": {
    POST: (req: Request & { params: { postId: string } }) =>
      handleInternalCompleteChatPostStream(req, req.params.postId),
  },

  "/internal/chat/posts/:postId/abort": {
    POST: (req: Request & { params: { postId: string } }) =>
      handleInternalAbortChatPostStream(req, req.params.postId),
  },
} as const;
