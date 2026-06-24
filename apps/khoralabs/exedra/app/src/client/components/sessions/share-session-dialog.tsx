import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ShareSessionContent } from "./share-session-content";

type ShareSessionDialogProps = {
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after any access change so panels can refresh their list. */
  onChanged?: () => void;
};

export function ShareSessionDialog({
  sessionId,
  open,
  onOpenChange,
  onChanged,
}: ShareSessionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share session</DialogTitle>
        </DialogHeader>
        <ShareSessionContent sessionId={sessionId} active={open} onChanged={onChanged} />
      </DialogContent>
    </Dialog>
  );
}
