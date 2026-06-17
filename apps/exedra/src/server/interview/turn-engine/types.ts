import type { Database } from "bun:sqlite";
import type { UIMessage } from "ai";

import type { runInterviewTurn } from "../../../agents/index";
import type { SessionRecord } from "../../db/sessions";
import type { TurnEmitter } from "./events";

export type SubmitTurnOutcome = { ok: true } | { ok: false; error: string };

export type SubmitTurnInput = {
  threadId: string;
  turnId: string;
  text: string;
  documentIds?: readonly string[];
  userTimeZone?: string;
  emit: TurnEmitter;
};

export type KickoffTurnInput = {
  threadId: string;
  userTimeZone?: string;
  emit: TurnEmitter;
};

export type DeferredOnboarding = {
  summary: string | null;
  requested: boolean;
};

export type ExecuteTurnInput = {
  db: Database;
  threadId: string;
  turnId: string;
  session: SessionRecord;
  text: string;
  documentIds?: readonly string[];
  metadata?: UIMessage["metadata"];
  userTimeZone?: string;
  signal: AbortSignal;
  emit: TurnEmitter;
};

export type TurnEngineDeps = {
  db: Database;
  runInterviewTurn: typeof runInterviewTurn;
  createModel: () => ReturnType<typeof import("../../../agents/index").createModel>;
  getAgentRegistry: () => ReturnType<typeof import("../../../agents/index").getAgentRegistry>;
};

export type TurnEngine = {
  submitTurn(input: SubmitTurnInput): SubmitTurnOutcome;
  abortTurn(input: { threadId: string; turnId: string }): void;
  releaseThread(threadId: string): void;
  runKickoffTurn(input: KickoffTurnInput): Promise<void>;
};
