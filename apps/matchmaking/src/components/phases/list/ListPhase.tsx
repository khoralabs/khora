import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useMatchmakingNavigation } from "@/components/phases/navigation/matchmaking-navigation-context";
import { usePersonaDirectory } from "@/components/phases/list/persona-directory-context";

export function ListPhase() {
  const { personas } = usePersonaDirectory();
  const { openDetail } = useMatchmakingNavigation();
  const list = personas ?? [];

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-medium text-muted-foreground">Directory</h2>
      <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory scroll-pl-6 [-webkit-overflow-scrolling:touch]">
        {list.map((p) => (
          <button
            key={p.slug}
            type="button"
            onClick={() => openDetail(p.slug)}
            className="snap-start shrink-0 text-left focus-visible:ring-ring/50 rounded-xl outline-none focus-visible:ring-[3px]"
          >
            <Card
              className={`hover:bg-accent/40 w-[min(100vw-3rem,320px)] transition-colors ${
                p.role === "self" ? "ring-2 ring-primary/60" : ""
              }`}
            >
              <CardHeader className="gap-2">
                {p.role === "self" && (
                  <p className="text-primary text-xs font-medium uppercase tracking-wide">You</p>
                )}
                <CardTitle className="text-base">{p.name}</CardTitle>
                <CardDescription className="line-clamp-2">{p.profile.tagline}</CardDescription>
              </CardHeader>
              <CardContent>
                <span className="text-primary text-sm font-medium">View profile →</span>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>
      <p className="text-muted-foreground text-sm">
        Your card appears here after you save it from <strong>My profile</strong>.
      </p>
    </section>
  );
}
