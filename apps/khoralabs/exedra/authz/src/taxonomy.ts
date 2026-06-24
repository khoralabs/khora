export const EntityType = {
  Account: "account",
  Organization: "org",
  Team: "team",
  Session: "session",
  Thread: "thread",
  Document: "document",
  Agent: "agent",
} as const;

export const Feature = {
  Member: "member",
  Admin: "admin",
  Participant: "participant",
  Facilitation: "facilitation",
  Read: "read",
  Write: "write",
  Contributor: "contributor",
} as const;

export const OrgPermission = {
  PermissionsManage: "permissions_manage",
  Write: "write",
  Read: "read",
  TeamManage: "team_manage",
  MemberManage: "member_manage",
  SessionCreate: "session_create",
} as const;

export const TeamPermission = {
  Write: "write",
  Read: "read",
  MemberManage: "member_manage",
  SessionCreate: "session_create",
} as const;

export const Relation = {
  MemberOf: "member_of",
  BelongsTo: "belongs_to",
  Owns: "owns",
  Represents: "represents",
  ProtectedBy: "protected_by",
} as const;

export const AuthAction = {
  TeamMember: "team:member",
  TeamAdmin: "team:admin",
  TeamRead: "team:read",
  TeamWrite: "team:write",
  TeamMemberManage: "team:member_manage",
  TeamSessionCreate: "team:session_create",
  OrgMember: "org:member",
  OrgAdmin: "org:admin",
  OrgRead: "org:read",
  OrgWrite: "org:write",
  OrgPermissionsManage: "org:permissions_manage",
  OrgTeamManage: "org:team_manage",
  OrgMemberManage: "org:member_manage",
  OrgSessionCreate: "org:session_create",
  SessionView: "session:view",
  ThreadRead: "thread:read",
  MemoryRead: "memory.read",
  DocumentRead: "document.read",
  ChatThreadWrite: "chat.thread.write",
} as const;

export const ORG_PERMISSIONS = [
  OrgPermission.PermissionsManage,
  OrgPermission.Write,
  OrgPermission.Read,
  OrgPermission.TeamManage,
  OrgPermission.MemberManage,
  OrgPermission.SessionCreate,
] as const;

export const TEAM_PERMISSIONS = [
  TeamPermission.Write,
  TeamPermission.Read,
  TeamPermission.MemberManage,
  TeamPermission.SessionCreate,
] as const;
