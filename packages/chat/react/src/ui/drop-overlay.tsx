import { FilePlusIcon } from "lucide-react";
import { Shimmer } from "./ai-elements/shimmer.tsx";

export function ChatDropOverlay({ active }: { active: boolean }) {
  if (!active) return null;

  return (
    <div
      aria-hidden={!active}
      className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-background/50 backdrop-blur-md"
    >
      <div className="flex flex-col items-center gap-3 rounded-xl bg-background/80 px-8 py-6 shadow-lg backdrop-blur-md">
        <FilePlusIcon className="size-8 animate-pulse text-muted-foreground" />
        <Shimmer as="p" className="font-medium text-muted-foreground">
          Drop files to attach
        </Shimmer>
        <Shimmer as="p" className="text-sm text-muted-foreground" duration={2.5}>
          Release to add to your message
        </Shimmer>
      </div>
    </div>
  );
}
