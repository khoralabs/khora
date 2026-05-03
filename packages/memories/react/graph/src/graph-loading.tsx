import { Spinner } from "@/components/ui/spinner.js";
import { useMemoriesGraphChrome } from "./use-projection.js";

/** Center loading chip while graph payload loads; reads {@link useMemoriesGraphChrome}. */
export function GraphLoading() {
  const { graphLoading, graphError } = useMemoriesGraphChrome();
  if (!graphLoading || graphError) return null;
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-background/80 px-3 py-2 text-sm text-muted-foreground shadow-sm backdrop-blur-sm">
      <Spinner aria-hidden />
      <span>Loading…</span>
    </div>
  );
}
