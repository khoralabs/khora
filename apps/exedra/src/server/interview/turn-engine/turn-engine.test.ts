import { Database } from "bun:sqlite";
import { afterEach, beforeEach, expect, test } from "bun:test";

import { TurnAbortedError } from "../../../agents/errors";
import type { runInterviewTurn } from "../../../agents/index";
import { grantSessionCreatorAccess } from "../../authz";
import { loadThreadMessages } from "../../db/messages";
import { ensureExedraSchema } from "../../db/schema";
import {
  createOrg,
  createSession,
  createTeam,
  getOrCreateInterviewThread,
} from "../../db/sessions";
import { insertSessionDocument } from "../../documents/db";
import { getOrCreateUser } from "../../identity/users";
import { createTurnEngine } from "./index";

type RunInterviewTurnFn = typeof runInterviewTurn;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForThreadIdle(): Promise<void> {
  return sleep(250);
}

function buildTestEngine(args: { db: Database; runInterviewTurn: RunInterviewTurnFn }) {
  return createTurnEngine({
    db: args.db,
    runInterviewTurn: args.runInterviewTurn,
    createModel: () => ({}) as ReturnType<typeof import("../../../agents/index").createModel>,
    getAgentRegistry: () =>
      ({}) as ReturnType<typeof import("../../../agents/index").getAgentRegistry>,
  });
}

let db: Database;
let threadId: string;
let userId: string;
let sessionId: string;
let teamId: string;

beforeEach(async () => {
  process.env.EXEDRA_IDENTITY_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  db = new Database(":memory:");
  ensureExedraSchema(db);

  const user = await getOrCreateUser(db, "registry-turn-engine");
  userId = user.id;
  const orgId = await createOrg(db, { name: "Org", ownerId: userId });
  teamId = createTeam(db, { orgId, name: "Team", ownerId: userId });

  const session = createSession(db, {
    teamId,
    topic: "Test topic",
  });
  grantSessionCreatorAccess(db, userId, session.id);
  sessionId = session.id;
  threadId = getOrCreateInterviewThread(db, { sessionId, userId });
});

afterEach(() => {
  db.close();
  delete process.env.EXEDRA_IDENTITY_KEY;
});

test("submitTurn commits user and assistant messages on success", async () => {
  const mockRunInterviewTurn: RunInterviewTurnFn = async () => ({
    assistantParts: [{ type: "text", text: "Reply" }],
    beliefFlags: [],
    sessionCompleted: false,
    sessionCompletion: null,
  });

  const engine = buildTestEngine({ db, runInterviewTurn: mockRunInterviewTurn });
  const events: unknown[] = [];

  const accepted = engine.submitTurn({
    threadId,
    turnId: "turn-success",
    text: "Hello",
    emit: (event) => events.push(event),
  });

  expect(accepted).toEqual({ ok: true });
  await waitForThreadIdle();

  const messages = loadThreadMessages(db, threadId);
  expect(messages).toHaveLength(2);
  expect(messages[0]?.id).toBe("turn-success");
  expect(messages[1]?.role).toBe("assistant");
  expect(events.some((event) => (event as { type: string }).type === "assistant_message")).toBe(
    true,
  );
});

test("abortTurn rolls back persisted user message", async () => {
  const mockRunInterviewTurn: RunInterviewTurnFn = async (args) => {
    args.onTextDelta("partial");
    await sleep(30);
    if (args.abortSignal?.aborted) {
      throw new TurnAbortedError();
    }
    return {
      assistantParts: [{ type: "text", text: "Should not persist" }],
      beliefFlags: [],
      sessionCompleted: false,
      sessionCompletion: null,
    };
  };

  const engine = buildTestEngine({ db, runInterviewTurn: mockRunInterviewTurn });
  const events: unknown[] = [];

  const accepted = engine.submitTurn({
    threadId,
    turnId: "turn-abort",
    text: "Hello",
    emit: (event) => events.push(event),
  });
  expect(accepted).toEqual({ ok: true });

  await sleep(5);
  engine.abortTurn({ threadId, turnId: "turn-abort" });
  await waitForThreadIdle();

  expect(loadThreadMessages(db, threadId)).toHaveLength(0);
  expect(events.some((event) => (event as { type: string }).type === "turn_aborted")).toBe(true);
});

test("submitTurn rejects concurrent turns on the same thread", async () => {
  const mockRunInterviewTurn: RunInterviewTurnFn = async () => {
    await sleep(50);
    return {
      assistantParts: [{ type: "text", text: "Reply" }],
      beliefFlags: [],
      sessionCompleted: false,
      sessionCompletion: null,
    };
  };

  const engine = buildTestEngine({ db, runInterviewTurn: mockRunInterviewTurn });

  const first = engine.submitTurn({
    threadId,
    turnId: "turn-one",
    text: "First",
    emit: () => undefined,
  });
  const second = engine.submitTurn({
    threadId,
    turnId: "turn-two",
    text: "Second",
    emit: () => undefined,
  });

  expect(first).toEqual({ ok: true });
  expect(second).toEqual({ ok: false, error: "A turn is already in progress" });

  await waitForThreadIdle();
});

test("abortTurn deletes attached session documents", async () => {
  const documentId = "doc-abort-1";
  insertSessionDocument(db, {
    id: documentId,
    sessionId,
    uploadedByUserId: userId,
    fileName: "notes.txt",
    mimeType: "text/plain",
    byteSize: 4,
    contentHash: "abc",
    s3Key: "unused",
    memoryKey: "mem-key",
    summary: "summary",
  });

  const mockRunInterviewTurn: RunInterviewTurnFn = async () => {
    await sleep(20);
    throw new TurnAbortedError();
  };

  const engine = buildTestEngine({ db, runInterviewTurn: mockRunInterviewTurn });
  engine.submitTurn({
    threadId,
    turnId: "turn-doc-abort",
    text: "See attachment",
    documentIds: [documentId],
    emit: () => undefined,
  });

  await sleep(5);
  engine.abortTurn({ threadId, turnId: "turn-doc-abort" });
  await waitForThreadIdle();

  const row = db
    .query<{ id: string }, [string]>(`SELECT id FROM session_documents WHERE id = ?`)
    .get(documentId);
  expect(row).toBeNull();
});

test("deferred onboarding is not applied when turn aborts after tool request", async () => {
  db.prepare(`UPDATE sessions SET kind = 'onboarding' WHERE id = ?`).run(sessionId);
  const { setTeamMemberOnboardingSession } = await import("../../db/membership");
  setTeamMemberOnboardingSession(db, { teamId, userId, sessionId });

  const mockRunInterviewTurn: RunInterviewTurnFn = async (args) => {
    args.onCompleteSession?.({
      summary: "summary should not commit",
      nextSessionOptions: ["Topic A", "Topic B"],
    });
    throw new TurnAbortedError();
  };

  const engine = buildTestEngine({ db, runInterviewTurn: mockRunInterviewTurn });
  engine.submitTurn({
    threadId,
    turnId: "turn-onboarding-abort",
    text: "Hello",
    emit: () => undefined,
  });

  await waitForThreadIdle();

  const member = db
    .query<{ onboarding_interview_complete: number }, [string, string]>(
      `SELECT onboarding_interview_complete FROM team_account_onboarding WHERE team_id = ? AND account_id = ?`,
    )
    .get(teamId, userId);
  expect(member?.onboarding_interview_complete).toBe(0);
  expect(loadThreadMessages(db, threadId)).toHaveLength(0);
});

test("submitTurn persists session completion without closing session", async () => {
  const { getSession } = await import("../../db/sessions");
  const { buildSessionClosingMessage } = await import("../../../agents/interview/session-closing");

  const completion = {
    summary: "We covered roadmap priorities.",
    nextSessionOptions: ["Release cadence", "Quality bar"],
  };

  const mockRunInterviewTurn: RunInterviewTurnFn = async (args) => {
    args.onCompleteSession?.(completion);
    return {
      assistantParts: [{ type: "text", text: buildSessionClosingMessage(completion) }],
      beliefFlags: [],
      sessionCompleted: true,
      sessionCompletion: completion,
    };
  };

  const engine = buildTestEngine({ db, runInterviewTurn: mockRunInterviewTurn });
  const events: unknown[] = [];

  const accepted = engine.submitTurn({
    threadId,
    turnId: "turn-complete",
    text: "Wrap up",
    emit: (event) => events.push(event),
  });

  expect(accepted).toEqual({ ok: true });
  await waitForThreadIdle();

  const session = getSession(db, sessionId);
  expect(session?.status).toBe("alignment");
  expect(session?.interviewSummary).toBe(completion.summary);
  expect(session?.nextSessionOptions).toEqual(completion.nextSessionOptions);
  expect(session?.interviewCompletedAtMs).not.toBeNull();
  expect(events.some((event) => (event as { type: string }).type === "session_complete")).toBe(
    true,
  );
});

test("submitTurn emits session_complete with onboarding kind for onboarding sessions", async () => {
  db.prepare(`UPDATE sessions SET kind = 'onboarding' WHERE id = ?`).run(sessionId);
  const { setTeamMemberOnboardingSession } = await import("../../db/membership");
  setTeamMemberOnboardingSession(db, { teamId, userId, sessionId });

  const completion = {
    summary: "Onboarding summary",
    nextSessionOptions: ["Team rituals", "Decision making"],
  };

  const mockRunInterviewTurn: RunInterviewTurnFn = async (args) => {
    args.onCompleteSession?.(completion);
    return {
      assistantParts: [{ type: "text", text: "Done" }],
      beliefFlags: [],
      sessionCompleted: true,
      sessionCompletion: completion,
    };
  };

  const engine = buildTestEngine({ db, runInterviewTurn: mockRunInterviewTurn });
  const events: unknown[] = [];
  engine.submitTurn({
    threadId,
    turnId: "turn-onboarding-complete",
    text: "Finish",
    emit: (event) => events.push(event),
  });

  await waitForThreadIdle();

  const completionEvent = events.find(
    (event) => (event as { type: string }).type === "session_complete",
  ) as
    | {
        completion: { sessionKind: string; summary: string; nextSessionOptions: string[] };
      }
    | undefined;
  expect(completionEvent?.completion.sessionKind).toBe("onboarding");
  expect(completionEvent?.completion.summary).toBe("Onboarding summary");
  expect(completionEvent?.completion.nextSessionOptions).toEqual([
    "Team rituals",
    "Decision making",
  ]);
});
