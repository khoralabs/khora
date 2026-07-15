import type {
  HostEventBase,
  PrincipalId,
  PrincipalRegistrationRequest,
} from "@khoralabs/khora-contracts";

export type { HostEventBase };

/** Constraint for {@link HostRuntime} `TAppEvent` generic. */
export type HostAppEventConstraint = HostEventBase<string, unknown>;

export const HOST_EVENT_KIND = {
  REGISTRATION_PROFILE_BUILD: "host.registration.profile_build",
  PROFILE_CREATED: "host.profile.created",
  PROFILE_UPDATED: "host.profile.updated",
  PROFILE_DELETED: "host.profile.deleted",
} as const;

/** Emitted during {@link HostRuntime.registerPrincipal}; listener must call `fulfill` or `reject` exactly once. */
export type HostRegistrationProfileBuildPayload<TProfile> = {
  request: PrincipalRegistrationRequest;
  fulfill: (profile: TProfile) => void;
  reject: (reason: unknown) => void;
};

export type HostRegistrationProfileBuildEvent<TProfile> = HostEventBase<
  typeof HOST_EVENT_KIND.REGISTRATION_PROFILE_BUILD,
  HostRegistrationProfileBuildPayload<TProfile>
>;

export type HostProfileCreatedEvent<TProfile> = HostEventBase<
  typeof HOST_EVENT_KIND.PROFILE_CREATED,
  { profile: TProfile }
>;

export type HostProfileUpdatedEvent<TProfile> = HostEventBase<
  typeof HOST_EVENT_KIND.PROFILE_UPDATED,
  { profile: TProfile; previous: TProfile }
>;

export type HostProfileDeletedEvent<TProfile> = HostEventBase<
  typeof HOST_EVENT_KIND.PROFILE_DELETED,
  { profile: TProfile; principalId: PrincipalId }
>;

export type HostBuiltInEvent<TProfile = unknown> =
  | HostRegistrationProfileBuildEvent<TProfile>
  | HostProfileCreatedEvent<TProfile>
  | HostProfileUpdatedEvent<TProfile>
  | HostProfileDeletedEvent<TProfile>;

export type HostEventUnion<TProfile = unknown, TAppEvent extends HostAppEventConstraint = never> =
  | HostBuiltInEvent<TProfile>
  | ([TAppEvent] extends [never] ? never : TAppEvent);
