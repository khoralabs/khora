export type FacilitationEventKind = "participant_interview_completed";

export type FacilitationWorkflowParams = {
  jobId: string;
  sessionId: string;
  participantUserId: string;
  threadId: string;
  event: FacilitationEventKind;
};
