import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";

type MobileChromeLayoutContextValue = {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  canvasOpen: boolean;
  setCanvasOpen: (open: boolean) => void;
  isCompactChrome: boolean;
};

const MobileChromeLayoutContext = createContext<MobileChromeLayoutContextValue | null>(null);

function useMediaBelowLg(): boolean {
  const [isCompactChrome, setIsCompactChrome] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsCompactChrome(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return isCompactChrome;
}

export function MobileChromeLayoutProvider({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [canvasOpen, setCanvasOpen] = useState(false);
  const isCompactChrome = useMediaBelowLg();

  useEffect(() => {
    if (!isCompactChrome) {
      setSidebarOpen(false);
      setCanvasOpen(false);
    }
  }, [isCompactChrome]);

  const value = useMemo(
    () => ({
      sidebarOpen,
      setSidebarOpen,
      canvasOpen,
      setCanvasOpen,
      isCompactChrome,
    }),
    [sidebarOpen, canvasOpen, isCompactChrome],
  );

  return (
    <MobileChromeLayoutContext.Provider value={value}>
      {children}
    </MobileChromeLayoutContext.Provider>
  );
}

export function useMobileChromeLayoutOptional(): MobileChromeLayoutContextValue | null {
  return useContext(MobileChromeLayoutContext);
}

export function useMobileChromeLayout(): MobileChromeLayoutContextValue {
  const value = useMobileChromeLayoutOptional();
  if (value === null) {
    throw new Error("useMobileChromeLayout must be used within MobileChromeLayoutProvider");
  }
  return value;
}
