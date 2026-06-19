import type { Database } from "bun:sqlite";
import type { MessageAuthor } from "@shared/messages/author";
import { orgAgentDisplayName } from "@shared/messages/author";

import { resolveAccountProfile } from "../accounts/resolve-rows";
import { avatarUrlFromS3Key } from "../avatars/urls";
import type { OrgRecord } from "../db/membership";

function formatUserDisplayName(profile: { fullName: string | null; email: string | null }): string {
  const trimmed = profile.fullName?.trim() ?? "";
  if (trimmed.length > 0) return trimmed;

  const email = profile.email ?? "";
  const atIndex = email.indexOf("@");
  if (atIndex !== -1) {
    const localPart = email.slice(0, atIndex);
    if (localPart.length > 0) return localPart;
  }
  if (email.length > 0) return email;

  return "Unknown user";
}

function resolveOrgAgentAuthor(org: OrgRecord, orgDid: string): MessageAuthor {
  return {
    did: orgDid,
    kind: "org_agent",
    name: orgAgentDisplayName(org.name),
    email: null,
    avatarUrl: avatarUrlFromS3Key("org", org.id, org.avatarS3Key),
  };
}

function resolveUserAuthor(db: Database, userDid: string): MessageAuthor | null {
  const profile = resolveAccountProfile(db, userDid);
  if (profile === null) return null;
  return {
    did: profile.userId,
    kind: "user",
    name: formatUserDisplayName(profile),
    email: profile.email,
    avatarUrl: profile.avatarUrl,
  };
}

export function resolveMessageAuthor(
  db: Database,
  params: {
    authorDid: string;
    org: OrgRecord;
    orgDid: string;
  },
): MessageAuthor | null {
  const { authorDid, org, orgDid } = params;
  if (authorDid === orgDid) {
    return resolveOrgAgentAuthor(org, orgDid);
  }
  return resolveUserAuthor(db, authorDid);
}

export function resolveOrgAgentAuthorForOrg(org: OrgRecord, orgDid: string): MessageAuthor {
  return resolveOrgAgentAuthor(org, orgDid);
}

export function resolveViewerAuthor(db: Database, userId: string): MessageAuthor | null {
  return resolveUserAuthor(db, userId);
}
