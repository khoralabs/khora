export type { AgentRelayPersistence } from "@khoralabs/agent-relay";
export { RelayCatalogSourceMapStore } from "@khoralabs/relay-colonnade";
export { createRelayColonnadeSocial } from "./create-relay-colonnade-social.ts";
/** Requires `store` (same instance as `createRelayColonnadeSocial`); input must include `username`. Usernames are globally unique in the catalog. */
export {
  registerAgentOnColonnadePersistence,
  SOURCE_PRINCIPAL_TO_USERNAME,
  SOURCE_USERNAME_TO_PRINCIPAL,
  USERNAME_INDEX_TENANT_KEY,
} from "./social-registration.ts";
export { createSocialRelationshipPersistence } from "./social-relationship-persistence.ts";
export type {
  SocialAgentIdentity,
  SocialRegisterAgentInput,
  SocialRelationshipPersistence,
  SocialRelationshipRow,
} from "./social-types.ts";
