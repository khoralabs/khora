import { expect, test } from "bun:test";

import {
  buildOrgAvatarS3Key,
  buildTeamAvatarS3Key,
  buildUserAvatarS3Key,
} from "../avatars/keys.js";

const ORG_DID = "did:key:z6MkorgExample";
const ACCOUNT_DID = "did:key:z6MkaccountExample";
const TEAM_ID = "550e8400-e29b-41d4-a716-446655440000";

test("avatar keys use principal-owned file prefixes", () => {
  expect(buildOrgAvatarS3Key(ORG_DID, "png")).toBe(
    `exedra/organizations/${ORG_DID}/files/avatars/org/avatar.png`,
  );
  expect(buildTeamAvatarS3Key(ORG_DID, TEAM_ID, "webp")).toBe(
    `exedra/organizations/${ORG_DID}/files/avatars/teams/${TEAM_ID}/avatar.webp`,
  );
  expect(buildUserAvatarS3Key(ACCOUNT_DID, "jpg")).toBe(
    `exedra/accounts/${ACCOUNT_DID}/files/avatars/avatar.jpg`,
  );
});
