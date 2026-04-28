import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { PersonaPublicDto } from "@/lib/persona-public-dtos";

type PersonaDirectoryContextValue = {
  personas: PersonaPublicDto[] | null;
  loadError: string | null;
  reloadPersonas: () => Promise<void>;
};

const PersonaDirectoryContext = createContext<PersonaDirectoryContextValue | null>(null);

export function PersonaDirectoryProvider({ children }: { children: ReactNode }) {
  const [personas, setPersonas] = useState<PersonaPublicDto[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reloadPersonas = useCallback(async () => {
    const res = await fetch("/api/personas");
    if (!res.ok) {
      throw new Error(`Failed to load personas (${res.status})`);
    }
    const data = (await res.json()) as PersonaPublicDto[];
    setPersonas(data);
    setLoadError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await reloadPersonas();
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
  }, [reloadPersonas]);

  const value = useMemo(
    () => ({
      personas,
      loadError,
      reloadPersonas,
    }),
    [personas, loadError, reloadPersonas],
  );

  return <PersonaDirectoryContext.Provider value={value}>{children}</PersonaDirectoryContext.Provider>;
}

export function usePersonaDirectory(): PersonaDirectoryContextValue {
  const ctx = useContext(PersonaDirectoryContext);
  if (ctx === null) {
    throw new Error("usePersonaDirectory must be used within PersonaDirectoryProvider");
  }
  return ctx;
}
