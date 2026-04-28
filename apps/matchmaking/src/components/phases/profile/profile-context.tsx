import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
import { usePersonaDirectory } from "@/components/phases/list/persona-directory-context";
import { useMatchmakingNavigation } from "@/components/phases/navigation/matchmaking-navigation-context";

type ProfileContextValue = {
  profileLoadError: string | null;
  profileDisplayName: string;
  setProfileDisplayName: Dispatch<SetStateAction<string>>;
  profileTagline: string;
  setProfileTagline: Dispatch<SetStateAction<string>>;
  profileAbout: string;
  setProfileAbout: Dispatch<SetStateAction<string>>;
  profileSaveBusy: boolean;
  profileSaveError: string | null;
  goToProfile: () => void;
  goBackToListFromProfile: () => void;
  savePublicProfile: () => Promise<void>;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { phase, setPhase } = useMatchmakingNavigation();
  const { reloadPersonas } = usePersonaDirectory();

  const [profileDisplayName, setProfileDisplayName] = useState("");
  const [profileTagline, setProfileTagline] = useState("");
  const [profileAbout, setProfileAbout] = useState("");
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null);
  const [profileSaveBusy, setProfileSaveBusy] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (phase !== "profile") {
      return;
    }
    let cancelled = false;
    setProfileLoadError(null);
    (async () => {
      try {
        const res = await fetch("/api/me/public-profile");
        if (!res.ok) {
          throw new Error(`Failed to load profile (${res.status})`);
        }
        const data = (await res.json()) as {
          displayName?: string;
          tagline?: string;
          about?: string;
        };
        if (cancelled) {
          return;
        }
        setProfileDisplayName(typeof data.displayName === "string" ? data.displayName : "");
        setProfileTagline(typeof data.tagline === "string" ? data.tagline : "");
        setProfileAbout(typeof data.about === "string" ? data.about : "");
      } catch (e) {
        if (!cancelled) {
          setProfileLoadError(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase]);

  const goToProfile = useCallback(() => {
    setProfileSaveError(null);
    setPhase("profile");
  }, [setPhase]);

  const goBackToListFromProfile = useCallback(() => {
    setProfileSaveError(null);
    setPhase("list");
  }, [setPhase]);

  const savePublicProfile = useCallback(async () => {
    setProfileSaveBusy(true);
    setProfileSaveError(null);
    try {
      const res = await fetch("/api/me/public-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: profileDisplayName.trim(),
          tagline: profileTagline,
          about: profileAbout,
        }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: unknown };
      if (!res.ok) {
        const e = body.error;
        setProfileSaveError(
          typeof e === "string"
            ? e
            : "Could not save (display name is required; check field limits).",
        );
        return;
      }
      if (body.ok) {
        toast.success("Profile saved", {
          description: "Merged into the global namespace and your memory graph.",
        });
        await reloadPersonas();
        setPhase("list");
      }
    } catch (e) {
      setProfileSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setProfileSaveBusy(false);
    }
  }, [profileAbout, profileDisplayName, profileTagline, reloadPersonas, setPhase]);

  const value = useMemo(
    () => ({
      profileLoadError,
      profileDisplayName,
      setProfileDisplayName,
      profileTagline,
      setProfileTagline,
      profileAbout,
      setProfileAbout,
      profileSaveBusy,
      profileSaveError,
      goToProfile,
      goBackToListFromProfile,
      savePublicProfile,
    }),
    [
      profileLoadError,
      profileDisplayName,
      profileTagline,
      profileAbout,
      profileSaveBusy,
      profileSaveError,
      goToProfile,
      goBackToListFromProfile,
      savePublicProfile,
    ],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (ctx === null) {
    throw new Error("useProfile must be used within ProfileProvider");
  }
  return ctx;
}
