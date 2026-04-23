import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { NegotiationDevDrawer } from "@/components/NegotiationDevDrawer";

type PersonaPublicDto = {
  slug: string;
  name: string;
  agentId: string;
  subjectId: string;
  memoryNamespace: string;
  profile: { tagline: string; about: string };
};

type Phase = "list" | "detail" | "book";

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
        setConfirmOpen(true);
      }
    } catch (e) {
      setSendError(e instanceof Error ? e.message : String(e));
    } finally {
      setSendBusy(false);
    }
  }, [inviteMessage, selectedSlug]);

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

      <main className="mx-auto max-w-3xl px-6 py-8">
        {phase === "list" && (
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
                      <CardDescription className="line-clamp-2">{p.profile.tagline}</CardDescription>
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

        {phase === "detail" && selected !== null && (
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

        {phase === "book" && selected !== null && (
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
        onOpenChange={setDevDrawerOpen}
      />
    </div>
  );
}

export default App;
