import { createModel, getAgentRegistry, runInterviewTurn } from "../../../agents/index";
import {
  buildInterviewKickoffMessage,
  interviewKickoffMessageId,
} from "../../../agents/interview/instructions";
import { getDb } from "../../db/index";
import { loadThreadMessages } from "../../db/messages";
import { getSession, getThread } from "../../db/sessions";
import { getJob, setJobStatus } from "../../jobs/db.js";
import {
  cancelInterviewTurnTaskRun,
  isInterviewTurnWorkflowConfigured,
} from "../dispatch-interview-turn.js";
import { relayTurnEvent } from "../turn-relay.js";
import { createInFlightRegistry } from "./in-flight";
import { executeTurn } from "./transaction";
import type {
  KickoffTurnInput,
  SubmitTurnInput,
  SubmitTurnOutcome,
  TurnEngine,
  TurnEngineDeps,
} from "./types";

export type { TurnEmitter, TurnEvent } from "./events";
export type { KickoffTurnInput, SubmitTurnInput, SubmitTurnOutcome, TurnEngine } from "./types";

const TURN_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function isValidTurnId(turnId: string): boolean {
  return TURN_ID_PATTERN.test(turnId);
}

function resolveSubmitContext(
  db: ReturnType<typeof getDb>,
  threadId: string,
):
  | { ok: true; session: NonNullable<ReturnType<typeof getSession>> }
  | { ok: false; error: string } {
  const thread = getThread(db, threadId);
  if (thread === null) return { ok: false, error: "Thread not found" };

  const session = getSession(db, thread.session_id);
  if (session === null) return { ok: false, error: "Session not found" };

  return { ok: true, session };
}

export function createTurnEngine(deps: TurnEngineDeps): TurnEngine {
  const inFlight = createInFlightRegistry();

  return {
    submitTurn(input: SubmitTurnInput): SubmitTurnOutcome {
      const { threadId, turnId, text, documentIds, userTimeZone, emit } = input;

      if (!isValidTurnId(turnId)) {
        return { ok: false, error: "Invalid turn id" };
      }

      const trimmed = text.trim();
      const docs = documentIds ?? [];
      if (trimmed.length === 0 && docs.length === 0) {
        return { ok: false, error: "Empty message" };
      }

      const context = resolveSubmitContext(deps.db, threadId);
      if (!context.ok) return { ok: false, error: context.error };

      const abortController = inFlight.reserveTurn(threadId, turnId);
      if (abortController === null) {
        return { ok: false, error: "A turn is already in progress" };
      }

      const task = executeTurn(deps, {
        db: deps.db,
        threadId,
        turnId,
        session: context.session,
        text: trimmed,
        documentIds: docs,
        userTimeZone,
        signal: abortController.signal,
        emit,
      });
      inFlight.attachTask(threadId, turnId, task);

      return { ok: true };
    },

    abortTurn({ threadId, turnId }) {
      inFlight.abort(threadId, turnId);
      if (isInterviewTurnWorkflowConfigured()) {
        const job = getJob(deps.db, turnId);
        if (job?.kind === "interview_turn") {
          void cancelInterviewTurnTaskRun(job.taskRunId);
          setJobStatus(deps.db, turnId, "cancelled");
          relayTurnEvent(threadId, { type: "turn_aborted", turnId });
        }
      }
    },

    releaseThread(threadId) {
      inFlight.release(threadId);
    },

    async runKickoffTurn(input: KickoffTurnInput): Promise<void> {
      const { threadId, userTimeZone, emit } = input;
      const db = deps.db;

      const thread = getThread(db, threadId);
      if (thread === null) return;

      const existing = loadThreadMessages(db, threadId);
      if (existing.length > 0) return;

      const session = getSession(db, thread.session_id);
      if (session === null) return;

      const turnId = interviewKickoffMessageId(threadId);
      const kickoffText = buildInterviewKickoffMessage({ topic: session.topic });

      const abortController = inFlight.reserveTurn(threadId, turnId);
      if (abortController === null) return;

      const task = executeTurn(deps, {
        db,
        threadId,
        turnId,
        session,
        text: kickoffText,
        metadata: { kickoff: true },
        userTimeZone,
        signal: abortController.signal,
        emit,
      });
      inFlight.attachTask(threadId, turnId, task);

      await task;
    },
  };
}

let defaultEngine: TurnEngine | undefined;

export function getDefaultTurnEngine(): TurnEngine {
  if (defaultEngine === undefined) {
    defaultEngine = createTurnEngine({
      db: getDb(),
      runInterviewTurn,
      createModel,
      getAgentRegistry,
    });
  }
  return defaultEngine;
}
