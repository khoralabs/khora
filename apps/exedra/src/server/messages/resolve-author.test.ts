import { Database } from "bun:sqlite";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { getOrg } from "../db/membership";
import { insertMessage, loadThreadMessages, nextMessageIndex } from "../db/messages";
import { ensureExedraSchema } from "../db/schema";
import { createOrg, createSession, createTeam, getOrCreateInterviewThread } from "../db/sessions";
import { getOrCreateOrgIdentity } from "../identity/orgs";
import { getOrCreateUser } from "../identity/users";
import { resolveMessageAuthor } from "./resolve-author";

let db: Database;
let orgId: string;
let orgDid: string;
let userDid: string;
let threadId: string;

beforeAll(async () => {
  process.env.EXEDRA_IDENTITY_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  db = new Database(":memory:");
  ensureExedraSchema(db);

  const user = await getOrCreateUser(db, "author-user-id", "author@example.com");
  userDid = user.id;
  orgId = createOrg(db, { name: "Acme", ownerId: user.id });
  orgDid = (await getOrCreateOrgIdentity(db, orgId)).did;
  const teamId = createTeam(db, { orgId, name: "Team", ownerId: user.id });
  const session = createSession(db, { teamId, topic: "Review" });
  threadId = getOrCreateInterviewThread(db, { sessionId: session.id, userId: user.id });
});

afterAll(() => {
  db.close();
});

test("loadThreadMessages returns createdAtMs and authorDid", () => {
  const index = nextMessageIndex(db, threadId);
  insertMessage(db, {
    id: "msg-1",
    threadId,
    role: "user",
    parts: [{ type: "text", text: "Hello" }],
    messageIndex: index,
    authorDid: userDid,
    createdAtMs: 1_700_000_000_000,
  });

  const messages = loadThreadMessages(db, threadId);
  const message = messages.find((entry) => entry.id === "msg-1");
  expect(message?.createdAtMs).toBe(1_700_000_000_000);
  expect(message?.authorDid).toBe(userDid);
});

test("resolveMessageAuthor maps org agent DID", () => {
  const org = getOrg(db, orgId);
  expect(org).not.toBeNull();
  if (org === null) throw new Error("org not found");
  const author = resolveMessageAuthor(db, { authorDid: orgDid, org, orgDid });
  expect(author?.kind).toBe("org_agent");
  expect(author?.name).toBe("Acme via Agent");
  expect(author?.did).toBe(orgDid);
});

test("resolveMessageAuthor maps user DID", () => {
  const org = getOrg(db, orgId);
  if (org === null) throw new Error("org not found");
  const author = resolveMessageAuthor(db, { authorDid: userDid, org, orgDid });
  expect(author?.kind).toBe("user");
  expect(author?.name).toBe("author");
});
