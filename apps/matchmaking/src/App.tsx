import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { NegotiationDevDrawer } from "@/components/NegotiationDevDrawer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { stubPostNegotiationGateContent } from "@/lib/stub-post-negotiation-summary";

type PersonaPublicDto = {
  slug: string;
  name: string;
  agentId: string;
  subjectId: string;
  memoryNamespace: string;
  profile: { tagline: string; about: string };
};

type Phase = "list" | "detail" | "book" | "post_meeting_reflect";

export function App() {
  const [phase, setPhase] = useState<Phase>("list");
  const [personas, setPersonas] = useState<PersonaPublicDto[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [inviteMessage, setInviteMessage] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [negotiationRunId, setNegotiationRunId] = useState<string | null>(null);
  const [devDrawerOpen, setDevDrawerOpen] = useState(false);
  const [negotiationRunComplete, setNegotiationRunComplete] = useState(false);
  const [negotiationDoneResult, setNegotiationDoneResult] = useState<unknown | null>(null);
  const [gateOpen, setGateOpen] = useState(false);
  const [postReviewStep, setPostReviewStep] = useState<1 | 2>(1);
  const [reviewPendingDecision, setReviewPendingDecision] = useState<"accept" | "decline" | null>(
    null,
  );
  const [agentFeedback, setAgentFeedback] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  /** Snapshot of invite text when the request is sent (for post-meeting goals echo). */
  const [savedInviteText, setSavedInviteText] = useState("");
  const [meetingReflectionText, setMeetingReflectionText] = useState("");
  const [meetingReflectBusy, setMeetingReflectBusy] = useState(false);
  const [meetingReflectError, setMeetingReflectError] = useState<string | null>(null);
  /** One post-negotiation gate per run: first drawer close after `done` only. */
  const postNegotiationGateConsumed = useRef(false);

  const selected = useMemo(
    () => personas?.find((p) => p.slug === selectedSlug) ?? null,
    [personas, selectedSlug],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/personas");
        if (!res.ok) {
          throw new Error(`Failed to load personas (${res.status})`);
        }
        const data = (await res.json()) as PersonaPublicDto[];
        if (!cancelled) {
          setPersonas(data);
          setLoadError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : String(e));
          setPersonas(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openDetail = useCallback((slug: string) => {
    setSelectedSlug(slug);
    setPhase("detail");
  }, []);

  const openBook = useCallback(() => {
    setInviteMessage("");
    setSendError(null);
    setPhase("book");
  }, []);

  const goList = useCallback(() => {
    setSelectedSlug(null);
    setPhase("list");
    setInviteMessage("");
    setSendError(null);
  }, []);

  const exitPostMeetingToHome = useCallback(() => {
    setPhase("list");
    setSelectedSlug(null);
    setInviteMessage("");
    setSendError(null);
    setNegotiationRunId(null);
    setMeetingReflectionText("");
    setMeetingReflectError(null);
    setSavedInviteText("");
  }, []);

  const sendInvite = useCallback(async () => {
    if (selectedSlug === null) return;
    setSendBusy(true);
    setSendError(null);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personaSlug: selectedSlug, message: inviteMessage }),
      });
      const body = (await res.json()) as { ok?: boolean; runId?: string; error?: unknown };
      if (!res.ok) {
        setSendError(typeof body.error === "string" ? body.error : "Could not send invite");
        return;
      }
      if (body.ok) {
        if (typeof body.runId === "string") {
          setNegotiationRunId(body.runId);
        }
        setSavedInviteText(inviteMessage.trim());
        postNegotiationGateConsumed.current = false;
        setNegotiationRunComplete(false);
        setNegotiationDoneResult(null);
        setConfirmOpen(true);
      }
    } catch (e) {
      setSendError(e instanceof Error ? e.message : String(e));
    } finally {
      setSendBusy(false);
    }
  }, [inviteMessage, selectedSlug]);

  const gateContent = useMemo(
    () => stubPostNegotiationGateContent(negotiationDoneResult ?? { status: "unknown", rounds: 0 }),
    [negotiationDoneResult],
  );

  const onNegotiationRunFinished = useCallback((result: unknown) => {
    setNegotiationRunComplete(true);
    setNegotiationDoneResult(result);
  }, []);

  const onDevDrawerOpenChange = useCallback(
    (open: boolean) => {
      setDevDrawerOpen(open);
      if (!open && negotiationRunId !== null && negotiationRunComplete) {
        if (postNegotiationGateConsumed.current) {
          return;
        }
        postNegotiationGateConsumed.current = true;
        setReviewError(null);
        setPostReviewStep(1);
        setReviewPendingDecision(null);
        setAgentFeedback("");
        setGateOpen(true);
      }
    },
    [negotiationRunId, negotiationRunComplete],
  );

  const submitPostNegotiationReview = useCallback(
    async (feedbackTextForSubmit?: string) => {
      if (negotiationRunId === null || reviewPendingDecision === null) return;
      const wasAccept = reviewPendingDecision === "accept";
      const raw = feedbackTextForSubmit !== undefined ? feedbackTextForSubmit : agentFeedback;
      const trimmed = raw.trim();
      setReviewBusy(true);
      setReviewError(null);
      try {
        const res = await fetch("/api/post-negotiation/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            runId: negotiationRunId,
            decision: reviewPendingDecision,
            ...(trimmed.length > 0 ? { agentFeedback: trimmed } : {}),
          }),
        });
        const body = (await res.json()) as { ok?: boolean; error?: unknown };
        if (!res.ok) {
          setReviewError(typeof body.error === "string" ? body.error : "Could not save review");
          return;
        }
        if (body.ok) {
          setGateOpen(false);
          setPostReviewStep(1);
          setReviewPendingDecision(null);
          setAgentFeedback("");
          if (wasAccept) {
            toast.info("Time to reflect on your meeting", {
              description:
                "Your goals from the original invite are shown below. Jot down how the conversation lined up.",
            });
            setMeetingReflectionText("");
            setMeetingReflectError(null);
            setPhase("post_meeting_reflect");
          }
        }
      } catch (e) {
        setReviewError(e instanceof Error ? e.message : String(e));
      } finally {
        setReviewBusy(false);
      }
    },
    [agentFeedback, negotiationRunId, reviewPendingDecision],
  );

  const submitMeetingReflection = useCallback(async () => {
    if (negotiationRunId === null) return;
    const text = meetingReflectionText.trim();
    if (text.length === 0) return;
    setMeetingReflectBusy(true);
    setMeetingReflectError(null);
    try {
      const res = await fetch("/api/post-meeting-reflection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: negotiationRunId, text }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: unknown };
      if (!res.ok) {
        setMeetingReflectError(
          typeof body.error === "string" ? body.error : "Could not save reflection",
        );
        return;
      }
      if (body.ok) {
        toast.success("Reflection saved", {
          description: "It will be merged into the demo memory graph in the background.",
        });
        exitPostMeetingToHome();
      }
    } catch (e) {
      setMeetingReflectError(e instanceof Error ? e.message : String(e));
    } finally {
      setMeetingReflectBusy(false);
    }
  }, [exitPostMeetingToHome, meetingReflectionText, negotiationRunId]);

  if (loadError !== null && personas === null) {
    return (
      <div className="mx-auto flex min-h-svh max-w-lg flex-col justify-center gap-4 p-6">
        <p className="text-destructive text-sm">{loadError}</p>
        <Button type="button" variant="outline" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  if (personas === null) {
    return (
      <div className="flex min-h-svh items-center justify-center gap-2 text-muted-foreground">
        <Spinner />
        <span className="text-sm">Loading personas…</span>
      </div>
    );
  }

  return (
    <div className="bg-background text-foreground min-h-svh">
      <header className="border-b px-6 py-4">
        <h1 className="text-lg font-semibold tracking-tight">Matchmaking demo</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Browse seeded personas and send a meeting invite (demo only).
        </p>
      </header>

      <main className="mx-auto max-w-3xl min-h-[70vh] px-6 py-8">
        {phase === "post_meeting_reflect" && selected !== null && (
          <section className="space-y-8">
            <Button
              type="button"
              variant="ghost"
              className="-ml-2"
              onClick={exitPostMeetingToHome}
              disabled={meetingReflectBusy}
            >
              ← All personas
            </Button>
            <div>
              <h2 className="text-2xl font-semibold">Reflect on your meeting</h2>
              <p className="text-muted-foreground mt-2 text-sm">
                How did the conversation line up with what you wanted? Your original invite is here
                for context.
              </p>
            </div>
            {savedInviteText.length > 0 && (
              <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Your original intent
                </p>
                <p className="text-foreground mt-2 leading-relaxed whitespace-pre-wrap">
                  {savedInviteText}
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="meeting-reflection">Reflection</Label>
              <InputGroup>
                <InputGroupAddon align="block-start">
                  <InputGroupText>Meeting notes</InputGroupText>
                </InputGroupAddon>
                <InputGroupTextarea
                  id="meeting-reflection"
                  placeholder="What was useful, what you’d do differently, follow-ups…"
                  rows={6}
                  value={meetingReflectionText}
                  onChange={(e) => setMeetingReflectionText(e.target.value)}
                  disabled={meetingReflectBusy}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    type="button"
                    variant="default"
                    size="sm"
                    className="inline-flex items-center gap-1.5"
                    disabled={meetingReflectBusy || meetingReflectionText.trim().length === 0}
                    onClick={() => void submitMeetingReflection()}
                  >
                    {meetingReflectBusy ? (
                      <>
                        <Spinner className="size-3.5" />
                        Saving…
                      </>
                    ) : (
                      "Submit reflection"
                    )}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
              {meetingReflectError !== null && (
                <p className="text-destructive text-sm" role="alert">
                  {meetingReflectError}
                </p>
              )}
            </div>
            <div className="pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={meetingReflectBusy}
                onClick={exitPostMeetingToHome}
              >
                Skip for now
              </Button>
            </div>
          </section>
        )}

        {phase !== "post_meeting_reflect" && phase === "list" && (
          <section className="space-y-4">
            <h2 className="text-sm font-medium text-muted-foreground">Personas</h2>
            <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory scroll-pl-6 [-webkit-overflow-scrolling:touch]">
              {personas.map((p) => (
                <button
                  key={p.slug}
                  type="button"
                  onClick={() => openDetail(p.slug)}
                  className="snap-start shrink-0 text-left focus-visible:ring-ring/50 rounded-xl outline-none focus-visible:ring-[3px]"
                >
                  <Card className="hover:bg-accent/40 w-[min(100vw-3rem,320px)] transition-colors">
                    <CardHeader className="gap-2">
                      <CardTitle className="text-base">{p.name}</CardTitle>
                      <CardDescription className="line-clamp-2">
                        {p.profile.tagline}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <span className="text-primary text-sm font-medium">View profile →</span>
                    </CardContent>
                  </Card>
                </button>
              ))}
            </div>
          </section>
        )}

        {phase !== "post_meeting_reflect" && phase === "detail" && selected !== null && (
          <section className="space-y-6">
            <Button type="button" variant="ghost" className="-ml-2" onClick={goList}>
              ← All personas
            </Button>
            <div>
              <h2 className="text-2xl font-semibold">{selected.name}</h2>
              <p className="text-muted-foreground mt-1 text-xs">Subject id: {selected.subjectId}</p>
              <p className="text-muted-foreground mt-2 text-sm">{selected.profile.tagline}</p>
              <p className="mt-4 text-sm leading-relaxed">{selected.profile.about}</p>
            </div>
            <Button type="button" onClick={openBook}>
              Book a meeting
            </Button>
          </section>
        )}

        {phase !== "post_meeting_reflect" && phase === "book" && selected !== null && (
          <section className="space-y-6">
            <Button
              type="button"
              variant="ghost"
              className="-ml-2"
              onClick={() => {
                setSendError(null);
                setPhase("detail");
              }}
            >
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
        )}
      </main>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) {
            setInviteMessage("");
            setPhase("detail");
          }
        }}
      >
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
            <AlertDialogAction
              type="button"
              onClick={() => {
                if (negotiationRunId !== null) {
                  setDevDrawerOpen(true);
                }
                setInviteMessage("");
                setPhase("detail");
              }}
            >
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <NegotiationDevDrawer
        runId={negotiationRunId}
        open={devDrawerOpen}
        onOpenChange={onDevDrawerOpenChange}
        onRunFinished={onNegotiationRunFinished}
      />

      <AlertDialog
        open={gateOpen}
        onOpenChange={(o) => {
          if (reviewBusy) {
            return;
          }
          if (!o) {
            setPostReviewStep(1);
            setReviewPendingDecision(null);
            setAgentFeedback("");
            setReviewError(null);
          }
          setGateOpen(o);
        }}
      >
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
                    <p className="whitespace-pre-wrap mt-1">
                      {gateContent.recommendationRequester}
                    </p>
                  </div>
                  <div>
                    <p className="text-foreground font-medium text-sm">
                      For the other party (preview)
                    </p>
                    <p className="whitespace-pre-wrap mt-1">
                      {gateContent.recommendationRequestee}
                    </p>
                  </div>
                  <p className="text-xs">
                    Step 1 of 2: choose <span className="font-medium text-foreground">Accept</span>{" "}
                    or <span className="font-medium text-foreground">Decline</span> for the meeting,
                    then continue to optional feedback. Your choice and notes are sent together at
                    the end (one quick save; the heavy merge runs in the background on the server).
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
    </div>
  );
}

export default App;
