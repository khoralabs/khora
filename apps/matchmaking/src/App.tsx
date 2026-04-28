import { AppHeader } from "@/components/layout/AppHeader";
import { MatchmakingAppProviders } from "@/components/MatchmakingAppProviders";
import { NegotiationDevDrawer } from "@/components/NegotiationDevDrawer";
import { BookPhase } from "@/components/phases/book/BookPhase";
import { InviteReceivedDialog } from "@/components/phases/book/InviteReceivedDialog";
import { useInviteRun } from "@/components/phases/book/invite-run-context";
import { DetailPhase } from "@/components/phases/detail/DetailPhase";
import { ListPhase } from "@/components/phases/list/ListPhase";
import { usePersonaDirectory } from "@/components/phases/list/persona-directory-context";
import { useMatchmakingNavigation } from "@/components/phases/navigation/matchmaking-navigation-context";
import { PostMeetingReflectPhase } from "@/components/phases/post-meeting-reflect/PostMeetingReflectPhase";
import { ProfilePhase } from "@/components/phases/profile/ProfilePhase";
import { PostNegotiationReviewDialog } from "@/components/post-negotiation-review/PostNegotiationReviewDialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

function NegotiationDevDrawerHost() {
  const { negotiationRunId, devDrawerOpen, onDevDrawerOpenChange, onNegotiationRunFinished } =
    useInviteRun();
  return (
    <NegotiationDevDrawer
      runId={negotiationRunId}
      open={devDrawerOpen}
      onOpenChange={onDevDrawerOpenChange}
      onRunFinished={onNegotiationRunFinished}
    />
  );
}

function MatchmakingShell() {
  const { phase, selected } = useMatchmakingNavigation();

  return (
    <div className="bg-background text-foreground min-h-svh">
      <AppHeader />

      <main className="mx-auto max-w-3xl min-h-[70vh] px-6 py-8">
        {phase === "post_meeting_reflect" && selected !== null && <PostMeetingReflectPhase />}

        {phase !== "post_meeting_reflect" && phase === "list" && <ListPhase />}

        {phase !== "post_meeting_reflect" && phase === "detail" && selected !== null && (
          <DetailPhase />
        )}

        {phase !== "post_meeting_reflect" && phase === "book" && selected !== null && <BookPhase />}

        {phase === "profile" && <ProfilePhase />}
      </main>

      <InviteReceivedDialog />

      <NegotiationDevDrawerHost />

      <PostNegotiationReviewDialog />
    </div>
  );
}

function MatchmakingContent() {
  const { personas, loadError } = usePersonaDirectory();

  if (loadError !== null && personas === null) {
    return (
      <div className="mx-auto flex min-h-svh max-w-lg flex-col justify-center gap-4 p-6">
        <p className="text-destructive text-sm">{loadError}</p>
        <Button type="button" variant="outline" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  if (personas === null) {
    return (
      <div className="flex min-h-svh items-center justify-center gap-2 text-muted-foreground">
        <Spinner />
        <span className="text-sm">Loading personas…</span>
      </div>
    );
  }

  return <MatchmakingShell />;
}

export function App() {
  return (
    <MatchmakingAppProviders>
      <MatchmakingContent />
    </MatchmakingAppProviders>
  );
}

export default App;
