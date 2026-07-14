/** Opaque principal key (did:key or similar). Canonical home for host/shared wire types. */
export type PrincipalId = string;

export type HostAggregateRef = {
  domain: string;
  id: string;
};

export type HostEventChange = "created" | "updated" | "deleted";

export type HostEventSource = "host" | "app";

/** Standard envelope for host and app events. */
export type HostEventBase<TKind extends string = string, TPayload = unknown> = {
  kind: TKind;
  occurredAt: number;
  aggregate: HostAggregateRef;
  change: HostEventChange;
  source: HostEventSource;
  payload: TPayload;
  correlationId?: string;
};

export type PrincipalRegistrationRequest = {
  principalId: PrincipalId;
  metadata?: Record<string, unknown>;
  correlationId?: string;
};

export type PrincipalRegistrationResult<TProfile> = {
  principalId: PrincipalId;
  profile: TProfile;
  profileId: string;
};
