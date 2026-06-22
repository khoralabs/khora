export type InviteGrantEffect = {
  type: "grant";
  resourceType: "org" | "team" | "session" | "thread";
  resourceId: string;
  feature: string;
};

export type InviteEntitlementEffect = {
  type: "entitlement";
  feature: string;
};

export type InviteEffects = {
  grants: InviteGrantEffect[];
  entitlements: InviteEntitlementEffect[];
};

export function teamMemberInviteEffects(teamId: string): InviteEffects {
  return {
    grants: [{ type: "grant", resourceType: "team", resourceId: teamId, feature: "member" }],
    entitlements: [],
  };
}

/** Grants session:participant only — does NOT add the accepter to a team. Used for reusable share links. */
export function sessionParticipantOnlyInviteEffects(sessionId: string): InviteEffects {
  return {
    grants: [
      {
        type: "grant",
        resourceType: "session",
        resourceId: sessionId,
        feature: "participant",
      },
    ],
    entitlements: [],
  };
}

export function sessionParticipantInviteEffects(sessionId: string, teamId: string): InviteEffects {
  return {
    grants: [
      {
        type: "grant",
        resourceType: "session",
        resourceId: sessionId,
        feature: "participant",
      },
      {
        type: "grant",
        resourceType: "team",
        resourceId: teamId,
        feature: "member",
      },
    ],
    entitlements: [],
  };
}

/** Read-only session KG access without participant/contribute rights. */
export function sessionReaderInviteEffects(sessionId: string): InviteEffects {
  return {
    grants: [
      {
        type: "grant",
        resourceType: "session",
        resourceId: sessionId,
        feature: "read",
      },
    ],
    entitlements: [],
  };
}

/** Contribute to team KG without team membership. */
export function teamContributorInviteEffects(teamId: string): InviteEffects {
  return {
    grants: [
      {
        type: "grant",
        resourceType: "team",
        resourceId: teamId,
        feature: "contributor",
      },
    ],
    entitlements: [],
  };
}

export function parseInviteEffects(raw: string | Uint8Array): InviteEffects {
  const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
  const parsed = JSON.parse(text) as Partial<InviteEffects>;
  return {
    grants: Array.isArray(parsed.grants) ? parsed.grants : [],
    entitlements: Array.isArray(parsed.entitlements) ? parsed.entitlements : [],
  };
}

export function inviteKind(effects: InviteEffects): "team" | "session" | "unknown" {
  if (
    effects.grants.some(
      (grant) => grant.resourceType === "session" && grant.feature === "participant",
    )
  ) {
    return "session";
  }
  if (effects.grants.some((grant) => grant.resourceType === "team" && grant.feature === "member")) {
    return "team";
  }
  return "unknown";
}

export function teamIdFromEffects(effects: InviteEffects): string | null {
  return (
    effects.grants.find((grant) => grant.resourceType === "team" && grant.feature === "member")
      ?.resourceId ?? null
  );
}

export function sessionIdFromEffects(effects: InviteEffects): string | null {
  return (
    effects.grants.find(
      (grant) => grant.resourceType === "session" && grant.feature === "participant",
    )?.resourceId ?? null
  );
}
