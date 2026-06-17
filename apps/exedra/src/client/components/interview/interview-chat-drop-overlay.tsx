import { FilePlusIcon } from "lucide-react";

export function InterviewChatDropOverlay({ active }: { active: boolean }) {
  if (!active) return null;

  return (
    <div
      aria-hidden={!active}
      className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-background/50 backdrop-blur-md"
    >
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-primary/40 bg-background/80 px-8 py-6 shadow-lg">
        <FilePlusIcon className="size-8 text-primary" />
        <p className="font-medium text-foreground">Drop files to attach</p>
        <p className="text-sm text-muted-foreground">Release to add to your message</p>
      </div>
    </div>
  );
}
