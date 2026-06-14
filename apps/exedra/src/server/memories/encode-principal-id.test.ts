import { expect, test } from "bun:test";

import { encodePrincipalIdForMemories } from "./encode-principal-id";

test("encodePrincipalIdForMemories produces lowercase base64url", () => {
  const did = "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK";
  const encoded = encodePrincipalIdForMemories(did);
  expect(encoded).toMatch(/^[a-z0-9_-]+$/);
  expect(encodePrincipalIdForMemories(did)).toBe(encoded);
});

test("encodePrincipalIdForMemories differs from raw principal id", () => {
  const did = "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK";
  expect(encodePrincipalIdForMemories(did)).not.toBe(did);
});
