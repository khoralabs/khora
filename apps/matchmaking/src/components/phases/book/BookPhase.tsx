import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useInviteRun } from "@/components/phases/book/invite-run-context";
import { useMatchmakingNavigation } from "@/components/phases/navigation/matchmaking-navigation-context";

export function BookPhase() {
  const { selected } = useMatchmakingNavigation();
  const {
    inviteMessage,
    setInviteMessage,
    sendBusy,
    sendError,
    sendInvite,
    backFromBookToDetail,
  } = useInviteRun();

  if (selected === null) {
    return null;
  }

  return (
    <section className="space-y-6">
      <Button type="button" variant="ghost" className="-ml-2" onClick={backFromBookToDetail}>
        ← Back to profile
      </Button>
      <div>
        <h2 className="text-xl font-semibold">Invite {selected.name}</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Write a short message they will see with your meeting request.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="invite-body">Message</Label>
        <InputGroup>
          <InputGroupAddon align="block-start">
            <InputGroupText>Your invite</InputGroupText>
          </InputGroupAddon>
          <InputGroupTextarea
            id="invite-body"
            placeholder="Hi — I'd like 20 minutes to…"
            rows={5}
            value={inviteMessage}
            onChange={(e) => setInviteMessage(e.target.value)}
            disabled={sendBusy}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              type="button"
              variant="default"
              size="sm"
              className="inline-flex items-center gap-1.5"
              disabled={sendBusy || inviteMessage.trim().length === 0}
              onClick={() => void sendInvite()}
            >
              {sendBusy ? (
                <>
                  <Spinner className="size-3.5" />
                  Sending…
                </>
              ) : (
                "Send invite"
              )}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        {sendError !== null && (
          <p className="text-destructive text-sm" role="alert">
            {sendError}
          </p>
        )}
      </div>
    </section>
  );
}
