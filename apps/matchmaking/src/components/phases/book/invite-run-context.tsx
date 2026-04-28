import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { useMatchmakingNavigation } from "@/components/phases/navigation/matchmaking-navigation-context";
import {
  gateContentFromPartySummaries,
  stubPostNegotiationGateContent,
} from "@/lib/stub-post-negotiation-summary";
import type { PartyRunSummary, RunSummariesApiResponse } from "@/lib/summaries/summary-types";

type ReviewAcceptedPrep = () => void;

type InviteRunContextValue = {
  inviteMessage: string;
  setInviteMessage: Dispatch<SetStateAction<string>>;
  sendBusy: boolean;
  sendError: string | null;
  confirmOpen: boolean;
  setConfirmOpen: (open: boolean) => void;
  negotiationRunId: string | null;
  devDrawerOpen: boolean;
  setDevDrawerOpen: (open: boolean) => void;
  negotiationRunComplete: boolean;
  negotiationDoneResult: unknown | null;
  gateOpen: boolean;
  setGateOpen: (open: boolean) => void;
  postReviewStep: 1 | 2;
  setPostReviewStep: Dispatch<SetStateAction<1 | 2>>;
  reviewPendingDecision: "accept" | "decline" | null;
  setReviewPendingDecision: Dispatch<SetStateAction<"accept" | "decline" | null>>;
  agentFeedback: string;
  setAgentFeedback: Dispatch<SetStateAction<string>>;
  reviewBusy: boolean;
  reviewError: string | null;
  savedInviteText: string;
  savedInviteGoals: string[];
  gateContent: ReturnType<typeof stubPostNegotiationGateContent>;
  registerReviewAcceptedPrep: (fn: ReviewAcceptedPrep) => void;
  openBook: () => void;
  goList: () => void;
  sendInvite: () => Promise<void>;
  onDevDrawerOpenChange: (open: boolean) => void;
  onNegotiationRunFinished: (result: unknown) => void;
  submitPostNegotiationReview: (feedbackTextForSubmit?: string) => Promise<void>;
  refreshSavedInviteGoals: () => Promise<void>;
  /** Clears run-scoped state after leaving post-meeting flow. */
  resetAfterPostMeetingExit: () => void;
  backFromBookToDetail: () => void;
  onGateDialogOpenChange: (open: boolean) => void;
};

const InviteRunContext = createContext<InviteRunContextValue | null>(null);

export function InviteRunProvider({ children }: { children: ReactNode }) {
  const { selectedSlug, setPhase, setSelectedSlug } = useMatchmakingNavigation();

  const [inviteMessage, setInviteMessage] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [negotiationRunId, setNegotiationRunId] = useState<string | null>(null);
  const [devDrawerOpen, setDevDrawerOpen] = useState(false);
  const [negotiationRunComplete, setNegotiationRunComplete] = useState(false);
  const [negotiationDoneResult, setNegotiationDoneResult] = useState<unknown | null>(null);
  const [gateOpen, setGateOpen] = useState(false);
  const [postReviewStep, setPostReviewStep] = useState<1 | 2>(1);
  const [reviewPendingDecision, setReviewPendingDecision] = useState<"accept" | "decline" | null>(
    null,
  );
  const [agentFeedback, setAgentFeedback] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [savedInviteText, setSavedInviteText] = useState("");
  const [savedInviteGoals, setSavedInviteGoals] = useState<string[]>([]);
  const [runSummaries, setRunSummaries] = useState<PartyRunSummary[] | null>(null);
  const [runSummariesState, setRunSummariesState] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const postNegotiationGateConsumed = useRef(false);
  const reviewAcceptedPrepRef = useRef<ReviewAcceptedPrep>(() => {});

  const gateContent = useMemo(() => {
    if (runSummariesState === "ready" && runSummaries !== null && runSummaries.length === 2) {
      const requester = runSummaries.find((s) => s.partySlug === "_user_");
      const requestee = runSummaries.find((s) => s.partySlug !== "_user_");
      if (requester !== undefined && requestee !== undefined) {
        return gateContentFromPartySummaries(requester, requestee);
      }
    }
    if (runSummariesState === "loading") {
      return {
        fitSummary: "Generating personalized summaries for each party...",
        agenda: "Please wait a moment while summaries are prepared.",
        recommendationRequester: "Loading requester summary...",
        recommendationRequestee: "Loading requestee summary...",
      };
    }
    if (runSummariesState === "error") {
      return {
        fitSummary: "Summary generation failed; showing fallback guidance.",
        agenda: "Proceed with your own judgment from the transcript and known goals.",
        recommendationRequester: "Fallback summary active due to generation error.",
        recommendationRequestee: "Fallback summary active due to generation error.",
      };
    }
    return stubPostNegotiationGateContent(negotiationDoneResult ?? { status: "unknown", rounds: 0 });
  }, [negotiationDoneResult, runSummaries, runSummariesState]);

  const registerReviewAcceptedPrep = useCallback((fn: ReviewAcceptedPrep) => {
    reviewAcceptedPrepRef.current = fn;
  }, []);

  const resetAfterPostMeetingExit = useCallback(() => {
    setNegotiationRunId(null);
    setSavedInviteText("");
    setSavedInviteGoals([]);
    setRunSummaries(null);
    setRunSummariesState("idle");
    setInviteMessage("");
    setSendError(null);
  }, []);

  const refreshRunSummaries = useCallback(async (runId: string) => {
    setRunSummariesState("loading");
    try {
      const res = await fetch(`/api/runs/${encodeURIComponent(runId)}/summaries`);
      const body = (await res.json()) as RunSummariesApiResponse | { error?: unknown };
      if (!res.ok) {
        setRunSummariesState("error");
        return;
      }
      if ("status" in body && body.status === "ready") {
        setRunSummaries(body.summaries);
        setRunSummariesState("ready");
        return;
      }
      setRunSummariesState("loading");
      window.setTimeout(() => {
        void refreshRunSummaries(runId);
      }, 1200);
    } catch {
      setRunSummariesState("error");
    }
  }, []);

  const refreshSavedInviteGoals = useCallback(async () => {
    if (negotiationRunId === null) {
      setSavedInviteGoals([]);
      return;
    }
    try {
      const res = await fetch(`/api/invites/${encodeURIComponent(negotiationRunId)}/goals`);
      const body = (await res.json()) as { goals?: Array<{ text?: string }> };
      if (!res.ok) return;
      const goals = (body.goals ?? [])
        .map((g) => g.text?.trim() ?? "")
        .filter((g): g is string => g.length > 0);
      setSavedInviteGoals(goals);
    } catch {
      /* ignore background hydration errors */
    }
  }, [negotiationRunId]);

  const openBook = useCallback(() => {
    setInviteMessage("");
    setSendError(null);
    setPhase("book");
  }, [setPhase]);

  const goList = useCallback(() => {
    setSelectedSlug(null);
    setPhase("list");
    setInviteMessage("");
    setSendError(null);
  }, [setPhase, setSelectedSlug]);

  const backFromBookToDetail = useCallback(() => {
    setSendError(null);
    setPhase("detail");
  }, [setPhase]);

  const onGateDialogOpenChange = useCallback(
    (open: boolean) => {
      if (reviewBusy) {
        return;
      }
      if (!open) {
        setPostReviewStep(1);
        setReviewPendingDecision(null);
        setAgentFeedback("");
        setReviewError(null);
      }
      setGateOpen(open);
    },
    [reviewBusy],
  );

  const sendInvite = useCallback(async () => {
    if (selectedSlug === null) return;
    setSendBusy(true);
    setSendError(null);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personaSlug: selectedSlug, message: inviteMessage }),
      });
      const body = (await res.json()) as { ok?: boolean; runId?: string; error?: unknown };
      if (!res.ok) {
        setSendError(typeof body.error === "string" ? body.error : "Could not send invite");
        return;
      }
      if (body.ok) {
        if (typeof body.runId === "string") {
          setNegotiationRunId(body.runId);
        }
        setSavedInviteText(inviteMessage.trim());
        setSavedInviteGoals([]);
        setRunSummaries(null);
        setRunSummariesState("idle");
        postNegotiationGateConsumed.current = false;
        setNegotiationRunComplete(false);
        setNegotiationDoneResult(null);
        setConfirmOpen(true);
      }
    } catch (e) {
      setSendError(e instanceof Error ? e.message : String(e));
    } finally {
      setSendBusy(false);
    }
  }, [inviteMessage, selectedSlug]);

  const onNegotiationRunFinished = useCallback(
    (result: unknown) => {
      setNegotiationRunComplete(true);
      setNegotiationDoneResult(result);
      if (negotiationRunId !== null) {
        void refreshRunSummaries(negotiationRunId);
      }
    },
    [negotiationRunId, refreshRunSummaries],
  );

  const onDevDrawerOpenChange = useCallback(
    (open: boolean) => {
      setDevDrawerOpen(open);
      if (!open && negotiationRunId !== null && negotiationRunComplete) {
        if (postNegotiationGateConsumed.current) {
          return;
        }
        postNegotiationGateConsumed.current = true;
        setReviewError(null);
        setPostReviewStep(1);
        setReviewPendingDecision(null);
        setAgentFeedback("");
        setGateOpen(true);
      }
    },
    [negotiationRunId, negotiationRunComplete],
  );

  const submitPostNegotiationReview = useCallback(
    async (feedbackTextForSubmit?: string) => {
      if (negotiationRunId === null || reviewPendingDecision === null) return;
      const wasAccept = reviewPendingDecision === "accept";
      const raw = feedbackTextForSubmit !== undefined ? feedbackTextForSubmit : agentFeedback;
      const trimmed = raw.trim();
      setReviewBusy(true);
      setReviewError(null);
      try {
        const res = await fetch("/api/post-negotiation/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            runId: negotiationRunId,
            decision: reviewPendingDecision,
            ...(trimmed.length > 0 ? { agentFeedback: trimmed } : {}),
          }),
        });
        const body = (await res.json()) as { ok?: boolean; error?: unknown };
        if (!res.ok) {
          setReviewError(typeof body.error === "string" ? body.error : "Could not save review");
          return;
        }
        if (body.ok) {
          setGateOpen(false);
          setPostReviewStep(1);
          setReviewPendingDecision(null);
          setAgentFeedback("");
          if (wasAccept) {
            toast.info("Time to reflect on your meeting", {
              description:
                "Your goals from the original invite are shown below. Jot down how the conversation lined up.",
            });
            reviewAcceptedPrepRef.current();
            setPhase("post_meeting_reflect");
          }
        }
      } catch (e) {
        setReviewError(e instanceof Error ? e.message : String(e));
      } finally {
        setReviewBusy(false);
      }
    },
    [agentFeedback, negotiationRunId, reviewPendingDecision, setPhase],
  );

  const value = useMemo(
    () => ({
      inviteMessage,
      setInviteMessage,
      sendBusy,
      sendError,
      confirmOpen,
      setConfirmOpen,
      negotiationRunId,
      devDrawerOpen,
      setDevDrawerOpen,
      negotiationRunComplete,
      negotiationDoneResult,
      gateOpen,
      setGateOpen,
      postReviewStep,
      setPostReviewStep,
      reviewPendingDecision,
      setReviewPendingDecision,
      agentFeedback,
      setAgentFeedback,
      reviewBusy,
      reviewError,
      savedInviteText,
      savedInviteGoals,
      gateContent,
      registerReviewAcceptedPrep,
      openBook,
      goList,
      sendInvite,
      onDevDrawerOpenChange,
      onNegotiationRunFinished,
      submitPostNegotiationReview,
      refreshSavedInviteGoals,
      resetAfterPostMeetingExit,
      backFromBookToDetail,
      onGateDialogOpenChange,
    }),
    [
      inviteMessage,
      sendBusy,
      sendError,
      confirmOpen,
      negotiationRunId,
      devDrawerOpen,
      negotiationRunComplete,
      negotiationDoneResult,
      gateOpen,
      postReviewStep,
      reviewPendingDecision,
      agentFeedback,
      reviewBusy,
      reviewError,
      savedInviteText,
      savedInviteGoals,
      gateContent,
      registerReviewAcceptedPrep,
      openBook,
      goList,
      sendInvite,
      onDevDrawerOpenChange,
      onNegotiationRunFinished,
      submitPostNegotiationReview,
      refreshSavedInviteGoals,
      resetAfterPostMeetingExit,
      backFromBookToDetail,
      onGateDialogOpenChange,
    ],
  );

  return <InviteRunContext.Provider value={value}>{children}</InviteRunContext.Provider>;
}

export function useInviteRun(): InviteRunContextValue {
  const ctx = useContext(InviteRunContext);
  if (ctx === null) {
    throw new Error("useInviteRun must be used within InviteRunProvider");
  }
  return ctx;
}
