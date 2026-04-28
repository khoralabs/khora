import { useInviteRun } from "@/components/phases/book/invite-run-context";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupText,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

export function PostNegotiationReviewDialog() {
  const {
    gateOpen,
    onGateDialogOpenChange,
    reviewBusy,
    postReviewStep,
    setPostReviewStep,
    gateContent,
    reviewPendingDecision,
    setReviewPendingDecision,
    agentFeedback,
    setAgentFeedback,
    reviewError,
    submitPostNegotiationReview,
  } = useInviteRun();

  return (
    <AlertDialog open={gateOpen} onOpenChange={onGateDialogOpenChange}>
      <AlertDialogContent className="max-w-2xl sm:max-w-2xl max-h-[min(90vh,40rem)] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {postReviewStep === 1 ? "Agenda and fit (demo)" : "How did your agent represent you?"}
          </AlertDialogTitle>
          {postReviewStep === 1 ? (
            <AlertDialogDescription asChild>
              <div className="text-left text-sm text-muted-foreground space-y-4 max-w-full">
                <p className="whitespace-pre-wrap text-foreground/90">{gateContent.fitSummary}</p>
                <div>
                  <p className="text-foreground font-medium text-sm">Suggested agenda</p>
                  <p className="whitespace-pre-wrap mt-1">{gateContent.agenda}</p>
                </div>
                <div>
                  <p className="text-foreground font-medium text-sm">For you (requester)</p>
                  <p className="whitespace-pre-wrap mt-1">{gateContent.recommendationRequester}</p>
                </div>
                <div>
                  <p className="text-foreground font-medium text-sm">
                    For the other party (preview)
                  </p>
                  <p className="whitespace-pre-wrap mt-1">{gateContent.recommendationRequestee}</p>
                </div>
                <p className="text-xs">
                  Step 1 of 2: choose <span className="font-medium text-foreground">Accept</span> or{" "}
                  <span className="font-medium text-foreground">Decline</span> for the meeting, then
                  continue to optional feedback. Your choice and notes are sent together at the end
                  (one quick save; the heavy merge runs in the background on the server).
                </p>
              </div>
            </AlertDialogDescription>
          ) : (
            <AlertDialogDescription asChild>
              <div className="text-left text-sm text-muted-foreground">
                <p>
                  The negotiation you watched used your memory-backed twin. How well did the agent
                  stand in for you—tone, values, and boundaries? Step 2 of 2. Skip if you have
                  nothing to add.
                </p>
              </div>
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>

        {postReviewStep === 1 ? (
          <div className="grid gap-3 sm:grid-cols-2 sm:max-w-md">
            <Button
              type="button"
              variant={reviewPendingDecision === "decline" ? "default" : "outline"}
              onClick={() => setReviewPendingDecision("decline")}
            >
              Decline
            </Button>
            <Button
              type="button"
              variant={reviewPendingDecision === "accept" ? "default" : "outline"}
              onClick={() => setReviewPendingDecision("accept")}
            >
              Accept
            </Button>
          </div>
        ) : (
          <div className="space-y-2 text-foreground text-sm">
            <Label htmlFor="agent-feedback">Your review (optional)</Label>
            <InputGroup>
              <InputGroupAddon align="block-start">
                <InputGroupText>Feedback</InputGroupText>
              </InputGroupAddon>
              <InputGroupTextarea
                id="agent-feedback"
                rows={5}
                placeholder="The agent was too… / I would have…"
                value={agentFeedback}
                onChange={(e) => setAgentFeedback(e.target.value)}
                disabled={reviewBusy}
              />
            </InputGroup>
          </div>
        )}

        {reviewError !== null && (
          <p className="text-destructive text-sm" role="alert">
            {reviewError}
          </p>
        )}

        <AlertDialogFooter className={postReviewStep === 1 ? "sm:justify-end" : undefined}>
          {postReviewStep === 1 ? (
            <Button
              type="button"
              onClick={() => {
                setPostReviewStep(2);
              }}
              disabled={reviewPendingDecision === null}
            >
              Continue
            </Button>
          ) : (
            <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                disabled={reviewBusy}
                onClick={() => setPostReviewStep(1)}
              >
                Back
              </Button>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={reviewBusy}
                  onClick={() => void submitPostNegotiationReview("")}
                >
                  {reviewBusy ? (
                    <>
                      <Spinner className="size-3.5" />
                      Saving…
                    </>
                  ) : (
                    "Skip"
                  )}
                </Button>
                <Button
                  type="button"
                  disabled={reviewBusy}
                  onClick={() => void submitPostNegotiationReview()}
                >
                  {reviewBusy ? (
                    <>
                      <Spinner className="size-3.5" />
                      Saving…
                    </>
                  ) : (
                    "Submit"
                  )}
                </Button>
              </div>
            </div>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
