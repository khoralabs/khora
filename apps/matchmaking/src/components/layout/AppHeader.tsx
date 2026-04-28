import { useProfile } from "@/components/phases/profile/profile-context";
import { Button } from "@/components/ui/button";

export function AppHeader() {
  const { goToProfile } = useProfile();

  return (
    <header className="border-b px-6 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Matchmaking demo</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Browse profiles, set your public card, and send a meeting invite (demo only).
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={goToProfile}
        >
          My profile
        </Button>
      </div>
    </header>
  );
}
