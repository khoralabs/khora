import { Button } from "@/components/ui/button.js";
import { Kbd } from "@/components/ui/kbd";
import { useProjection } from "./use-projection.js";

export function GraphPinnedEscHint() {
  const { selected, pinnedEdge, graphSearch, dismissPersistentGraphFocus } = useProjection();
  const searchPins = graphSearch !== null && graphSearch.relevantKeys.size > 0;
  if (!selected && !pinnedEdge && !searchPins) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="absolute top-0 right-0 z-20 flex items-center gap-2 m-4"
      onClick={() => dismissPersistentGraphFocus()}
    >
      <span className="text-xs text-muted-foreground font-normal">esc to clear edges</span>
      <Kbd className="text-[10px]">Esc</Kbd>
    </Button>
  );
}
