import { useInviteRun } from "@/components/phases/book/invite-run-context";
import { useMatchmakingNavigation } from "@/components/phases/navigation/matchmaking-navigation-context";
import { useProfile } from "@/components/phases/profile/profile-context";
import { Button } from "@/components/ui/button";

export function DetailPhase() {
  const { selected } = useMatchmakingNavigation();
  const { goList, openBook } = useInviteRun();
  const { goToProfile } = useProfile();

  if (selected === null) {
    return null;
  }

  return (
    <section className="space-y-6">
      <Button type="button" variant="ghost" className="-ml-2" onClick={goList}>
        ← All profiles
      </Button>
      <div>
        <h2 className="text-2xl font-semibold">{selected.name}</h2>
        <p className="text-muted-foreground mt-1 text-xs">Subject id: {selected.subjectId}</p>
        <p className="text-muted-foreground mt-2 text-sm">{selected.profile.tagline}</p>
        <p className="mt-4 text-sm leading-relaxed">{selected.profile.about}</p>
      </div>
      {selected.role === "self" ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={goToProfile}>
            Edit in My profile
          </Button>
          <p className="text-muted-foreground w-full text-sm">
            This is your public card. Simulated people here can receive invites; your card is for
            the directory and your agent’s context.
          </p>
        </div>
      ) : (
        <Button type="button" onClick={openBook}>
          Book a meeting
        </Button>
      )}
    </section>
  );
}
