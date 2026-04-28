import { useInviteRun } from "@/components/phases/book/invite-run-context";
import { useMatchmakingNavigation } from "@/components/phases/navigation/matchmaking-navigation-context";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function InviteReceivedDialog() {
  const { selected, setPhase } = useMatchmakingNavigation();
  const { confirmOpen, setConfirmOpen, setInviteMessage, negotiationRunId, setDevDrawerOpen } =
    useInviteRun();

  const onOpenChange = (open: boolean) => {
    setConfirmOpen(open);
    if (!open) {
      setInviteMessage("");
      setPhase("detail");
    }
  };

  const onConfirm = () => {
    if (negotiationRunId !== null) {
      setDevDrawerOpen(true);
    }
    setInviteMessage("");
    setPhase("detail");
  };

  return (
    <AlertDialog open={confirmOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Invite received</AlertDialogTitle>
          <AlertDialogDescription>
            {selected !== null
              ? `${selected.name} got your invite and will review it. You will hear back if there is a fit.`
              : "Your invite was received and will be reviewed."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction type="button" onClick={onConfirm}>
            OK
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
