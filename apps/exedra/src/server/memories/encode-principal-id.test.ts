import { expect, test } from "bun:test";
import { zNamespacePath } from "@khoralabs/memories-core";
import {
  encodePrincipalIdForMemories,
  MEMORY_PRINCIPAL_SEGMENT_LENGTH,
} from "./encode-principal-id";
import { orgSessionScope, orgTeamScope, userSessionScope, userTeamScope } from "./namespaces";

const DID = "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK";
const TEAM_ID = "550e8400-e29b-41d4-a716-446655440000";
const SESSION_ID = crypto.randomUUID();

test("encodePrincipalIdForMemories produces short deterministic lowercase base64url", () => {
  const encoded = encodePrincipalIdForMemories(DID);
  expect(encoded).toMatch(/^[a-z0-9_-]+$/);
  expect(encoded.length).toBe(MEMORY_PRINCIPAL_SEGMENT_LENGTH);
  expect(encodePrincipalIdForMemories(DID)).toBe(encoded);
  expect(encodePrincipalIdForMemories(DID)).not.toBe(DID);
});

test("exedra memory namespace paths fit memories zNamespacePath limit", () => {
  for (const path of [
    orgTeamScope(DID, TEAM_ID),
    userTeamScope(DID, DID, TEAM_ID),
    orgSessionScope(DID, TEAM_ID, SESSION_ID),
    userSessionScope(DID, DID, TEAM_ID, SESSION_ID),
  ]) {
    expect(path.length).toBeLessThanOrEqual(128);
    expect(zNamespacePath.parse(path)).toBe(path);
  }
});
