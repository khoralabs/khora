import { expect, test } from "bun:test";

import { ResourceType, ScopeType } from "../authz/policy.js";
import { buildDocumentFileObjectKey, resolveDocumentStorageOwner } from "./owners.js";
import {
  databaseObjectKey,
  fileObjectKey,
  localDatabasePath,
  principalResourcePrefix,
  principalStoragePrefix,
  validatePrincipalDid,
} from "./paths.js";

const ORG_DID = "did:key:z6MkorgExample";
const ACCOUNT_DID = "did:key:z6MkaccountExample";

test("validatePrincipalDid rejects path separators", () => {
  expect(() => validatePrincipalDid("did:key:bad/path")).toThrow(
    "Principal DID must not contain path separators",
  );
});

test("principalStoragePrefix builds organization and account roots", () => {
  expect(principalStoragePrefix({ kind: "organization", did: ORG_DID })).toBe(
    `exedra/organizations/${ORG_DID}`,
  );
  expect(principalStoragePrefix({ kind: "account", did: ACCOUNT_DID })).toBe(
    `exedra/accounts/${ACCOUNT_DID}`,
  );
});

test("principalResourcePrefix adds files segment for file resources", () => {
  expect(
    principalResourcePrefix({ kind: "organization", did: ORG_DID, resource: "database" }),
  ).toBe(`exedra/organizations/${ORG_DID}`);
  expect(principalResourcePrefix({ kind: "organization", did: ORG_DID, resource: "file" })).toBe(
    `exedra/organizations/${ORG_DID}/files`,
  );
});

test("databaseObjectKey includes db sidecar suffixes", () => {
  expect(databaseObjectKey({ kind: "organization", did: ORG_DID })).toBe(
    `exedra/organizations/${ORG_DID}/${ORG_DID}.db`,
  );
  expect(databaseObjectKey({ kind: "account", did: ACCOUNT_DID, suffix: "-wal" })).toBe(
    `exedra/accounts/${ACCOUNT_DID}/${ACCOUNT_DID}.db-wal`,
  );
});

test("fileObjectKey builds category paths under files", () => {
  expect(
    fileObjectKey({
      kind: "organization",
      did: ORG_DID,
      category: "documents",
      parts: ["batches", "batch-1", "doc-1", "notes.txt"],
    }),
  ).toBe(`exedra/organizations/${ORG_DID}/files/documents/batches/batch-1/doc-1/notes.txt`);
});

test("localDatabasePath mirrors principal folder layout", () => {
  expect(
    localDatabasePath({
      kind: "account",
      did: ACCOUNT_DID,
      memoriesDir: "/data/memories",
    }),
  ).toBe(`/data/memories/accounts/${ACCOUNT_DID}/${ACCOUNT_DID}.db`);
});

test("resolveDocumentStorageOwner maps grant resources to principal ownership", () => {
  expect(
    resolveDocumentStorageOwner({
      grantResource: { type: ResourceType.Session, id: "session-1" },
      orgId: ORG_DID,
      userId: ACCOUNT_DID,
    }),
  ).toEqual({ kind: "organization", did: ORG_DID, category: "documents" });

  expect(
    resolveDocumentStorageOwner({
      grantResource: { type: ResourceType.Team, id: "team-1" },
      orgId: ORG_DID,
      userId: ACCOUNT_DID,
    }),
  ).toEqual({ kind: "organization", did: ORG_DID, category: "knowledge" });

  expect(
    resolveDocumentStorageOwner({
      grantResource: { type: ScopeType.Account, id: ACCOUNT_DID },
      orgId: "personal",
      userId: ACCOUNT_DID,
    }),
  ).toEqual({ kind: "account", did: ACCOUNT_DID, category: "knowledge" });
});

test("buildDocumentFileObjectKey uses resolved owner", () => {
  const owner = resolveDocumentStorageOwner({
    grantResource: { type: ResourceType.Session, id: "session-1" },
    orgId: ORG_DID,
    userId: ACCOUNT_DID,
  });
  expect(
    buildDocumentFileObjectKey({
      owner,
      batchId: "batch-1",
      documentId: "doc-1",
      fileName: "notes.txt",
    }),
  ).toBe(`exedra/organizations/${ORG_DID}/files/documents/batches/batch-1/doc-1/notes.txt`);
});
