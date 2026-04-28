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

const PROFILE_MEMORIES_SYNC_TIMEOUT_MS = 120_000;
const PROFILE_MEMORIES_SYNC_POLL_MS = 400;

async function waitForPublicProfileMemoriesSync(expectedGeneration: number): Promise<void> {
  const deadline = Date.now() + PROFILE_MEMORIES_SYNC_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = await fetch("/api/me/public-profile");
    if (!res.ok) {
      throw new Error(`Sync status request failed (${res.status})`);
    }
    const data = (await res.json()) as {
      memoriesSync?: { generation: number; result?: string; error?: string };
    };
    const m = data.memoriesSync;
    if (m?.generation === expectedGeneration && m.result === "ok") {
      return;
    }
    if (m?.generation === expectedGeneration && m.result === "err") {
      throw new Error(m.error ?? "Memory graph update failed");
    }
    await new Promise((r) => setTimeout(r, PROFILE_MEMORIES_SYNC_POLL_MS));
  }
  throw new Error(
    "Updating your memory graph is taking longer than expected. You can keep using the app; try saving again later.",
  );
}

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
      const body = (await res.json()) as {
        ok?: boolean;
        error?: unknown;
        memoriesSyncGeneration?: number;
      };
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
        await reloadPersonas();
        setPhase("list");
        const gen = body.memoriesSyncGeneration;
        if (typeof gen === "number") {
          void waitForPublicProfileMemoriesSync(gen)
            .then(() => {
              toast.success("Profile linked in memory graph", {
                description: "Agent merge and search metadata are up to date.",
              });
            })
            .catch((err) => {
              toast.error("Profile saved; memory graph update failed", {
                description: err instanceof Error ? err.message : String(err),
              });
            });
        }
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
