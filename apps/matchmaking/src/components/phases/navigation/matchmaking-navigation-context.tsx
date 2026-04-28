import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { Phase } from "@/components/phases/phase-type";
import type { PersonaPublicDto } from "@/lib/persona-public-dtos";
import { usePersonaDirectory } from "@/components/phases/list/persona-directory-context";

type MatchmakingNavigationContextValue = {
  phase: Phase;
  setPhase: Dispatch<SetStateAction<Phase>>;
  selectedSlug: string | null;
  setSelectedSlug: Dispatch<SetStateAction<string | null>>;
  selected: PersonaPublicDto | null;
  openDetail: (slug: string) => void;
};

const MatchmakingNavigationContext = createContext<MatchmakingNavigationContextValue | null>(null);

export function MatchmakingNavigationProvider({ children }: { children: ReactNode }) {
  const { personas } = usePersonaDirectory();
  const [phase, setPhase] = useState<Phase>("list");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  const selected = useMemo(
    () => personas?.find((p) => p.slug === selectedSlug) ?? null,
    [personas, selectedSlug],
  );

  const openDetail = useCallback((slug: string) => {
    setSelectedSlug(slug);
    setPhase("detail");
  }, []);

  const value = useMemo(
    () => ({
      phase,
      setPhase,
      selectedSlug,
      setSelectedSlug,
      selected,
      openDetail,
    }),
    [phase, selectedSlug, selected, openDetail],
  );

  return (
    <MatchmakingNavigationContext.Provider value={value}>{children}</MatchmakingNavigationContext.Provider>
  );
}

export function useMatchmakingNavigation(): MatchmakingNavigationContextValue {
  const ctx = useContext(MatchmakingNavigationContext);
  if (ctx === null) {
    throw new Error("useMatchmakingNavigation must be used within MatchmakingNavigationProvider");
  }
  return ctx;
}
