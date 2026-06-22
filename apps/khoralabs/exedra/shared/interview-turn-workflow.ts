/** Params passed from Exedra app to the runInterviewTurn Render workflow task. */
export type InterviewTurnWorkflowParams = {
  jobId: string;
  threadId: string;
  turnId: string;
  sessionId: string;
  userId: string;
  orgId: string;
  teamId: string;
  userTimeZone?: string;
  documentIds?: string[];
  kickoff?: boolean;
};
