import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { toast } from "sonner";
import { useInviteRun } from "@/components/phases/book/invite-run-context";
import { useMatchmakingNavigation } from "@/components/phases/navigation/matchmaking-navigation-context";

type PostMeetingReflectContextValue = {
  meetingReflectionText: string;
  setMeetingReflectionText: Dispatch<SetStateAction<string>>;
  meetingReflectBusy: boolean;
  meetingReflectError: string | null;
  submitMeetingReflection: () => Promise<void>;
  exitPostMeetingToHome: () => void;
};

const PostMeetingReflectContext = createContext<PostMeetingReflectContextValue | null>(null);

export function PostMeetingReflectProvider({ children }: { children: ReactNode }) {
  const { setPhase, setSelectedSlug } = useMatchmakingNavigation();
  const { negotiationRunId, resetAfterPostMeetingExit, registerReviewAcceptedPrep } = useInviteRun();

  const [meetingReflectionText, setMeetingReflectionText] = useState("");
  const [meetingReflectBusy, setMeetingReflectBusy] = useState(false);
  const [meetingReflectError, setMeetingReflectError] = useState<string | null>(null);

  useLayoutEffect(() => {
    registerReviewAcceptedPrep(() => {
      setMeetingReflectionText("");
      setMeetingReflectError(null);
    });
  }, [registerReviewAcceptedPrep]);

  const exitPostMeetingToHome = useCallback(() => {
    setPhase("list");
    setSelectedSlug(null);
    resetAfterPostMeetingExit();
    setMeetingReflectionText("");
    setMeetingReflectError(null);
  }, [resetAfterPostMeetingExit, setPhase, setSelectedSlug]);

  const submitMeetingReflection = useCallback(async () => {
    if (negotiationRunId === null) return;
    const text = meetingReflectionText.trim();
    if (text.length === 0) return;
    setMeetingReflectBusy(true);
    setMeetingReflectError(null);
    try {
      const res = await fetch("/api/post-meeting-reflection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: negotiationRunId, text }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: unknown };
      if (!res.ok) {
        setMeetingReflectError(
          typeof body.error === "string" ? body.error : "Could not save reflection",
        );
        return;
      }
      if (body.ok) {
        toast.success("Reflection saved", {
          description: "It will be merged into the demo memory graph in the background.",
        });
        exitPostMeetingToHome();
      }
    } catch (e) {
      setMeetingReflectError(e instanceof Error ? e.message : String(e));
    } finally {
      setMeetingReflectBusy(false);
    }
  }, [exitPostMeetingToHome, meetingReflectionText, negotiationRunId]);

  const value = useMemo(
    () => ({
      meetingReflectionText,
      setMeetingReflectionText,
      meetingReflectBusy,
      meetingReflectError,
      submitMeetingReflection,
      exitPostMeetingToHome,
    }),
    [
      meetingReflectionText,
      meetingReflectBusy,
      meetingReflectError,
      submitMeetingReflection,
      exitPostMeetingToHome,
    ],
  );

  return (
    <PostMeetingReflectContext.Provider value={value}>{children}</PostMeetingReflectContext.Provider>
  );
}

export function usePostMeetingReflect(): PostMeetingReflectContextValue {
  const ctx = useContext(PostMeetingReflectContext);
  if (ctx === null) {
    throw new Error("usePostMeetingReflect must be used within PostMeetingReflectProvider");
  }
  return ctx;
}
