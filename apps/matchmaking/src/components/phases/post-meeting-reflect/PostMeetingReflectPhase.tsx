import { useInviteRun } from "@/components/phases/book/invite-run-context";
import { usePostMeetingReflect } from "@/components/phases/post-meeting-reflect/post-meeting-reflect-context";
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

export function PostMeetingReflectPhase() {
  const { savedInviteText, savedInviteGoals } = useInviteRun();
  const {
    meetingReflectionText,
    setMeetingReflectionText,
    meetingReflectBusy,
    meetingReflectError,
    exitPostMeetingToHome,
    submitMeetingReflection,
  } = usePostMeetingReflect();

  return (
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
          How did the conversation line up with what you wanted? Your original invite is here for
          context.
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
          {savedInviteGoals.length > 0 && (
            <div className="mt-3 space-y-1.5">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Original goals
              </p>
              <ul className="list-disc space-y-1 pl-4">
                {savedInviteGoals.map((goal) => (
                  <li key={goal} className="text-foreground">
                    {goal}
                  </li>
                ))}
              </ul>
            </div>
          )}
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
  );
}
