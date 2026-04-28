import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useProfile } from "@/components/phases/profile/profile-context";

export function ProfilePhase() {
  const {
    profileLoadError,
    profileDisplayName,
    setProfileDisplayName,
    profileTagline,
    setProfileTagline,
    profileAbout,
    setProfileAbout,
    profileSaveBusy,
    profileSaveError,
    goBackToListFromProfile,
    savePublicProfile,
  } = useProfile();

  return (
    <section className="mx-auto max-w-lg space-y-6">
      <Button type="button" variant="ghost" className="-ml-2" onClick={goBackToListFromProfile} disabled={profileSaveBusy}>
        ← Directory
      </Button>
      <div>
        <h2 className="text-2xl font-semibold">Your public profile</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          After you save, this card appears in the directory and is merged into the shared global
          namespace and your personal memory graph (same fields the simulated profiles use).
        </p>
      </div>
      {profileLoadError !== null && (
        <p className="text-destructive text-sm" role="alert">
          {profileLoadError}
        </p>
      )}
      <div className="space-y-2">
        <Label htmlFor="pp-name">Display name</Label>
        <Input
          id="pp-name"
          className="w-full"
          value={profileDisplayName}
          onChange={(e) => setProfileDisplayName(e.target.value)}
          placeholder="How you appear in the list"
          disabled={profileSaveBusy}
          maxLength={200}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pp-tagline">Tagline</Label>
        <Textarea
          id="pp-tagline"
          value={profileTagline}
          onChange={(e) => setProfileTagline(e.target.value)}
          placeholder="One line under your name"
          disabled={profileSaveBusy}
          rows={2}
          maxLength={500}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pp-about">About</Label>
        <Textarea
          id="pp-about"
          value={profileAbout}
          onChange={(e) => setProfileAbout(e.target.value)}
          placeholder="What others should know before connecting"
          disabled={profileSaveBusy}
          rows={6}
          maxLength={8000}
        />
      </div>
      {profileSaveError !== null && (
        <p className="text-destructive text-sm" role="alert">
          {profileSaveError}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={profileSaveBusy || profileDisplayName.trim().length === 0}
          onClick={() => void savePublicProfile()}
        >
          {profileSaveBusy ? (
            <>
              <Spinner className="size-3.5" />
              Saving…
            </>
          ) : (
            "Save profile"
          )}
        </Button>
      </div>
    </section>
  );
}
