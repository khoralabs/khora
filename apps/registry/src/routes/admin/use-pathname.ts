import { useEffect, useState } from "react";

export function usePathname(): string {
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return pathname;
}

export function navigateAdmin(to: string): void {
  if (window.location.pathname === to) {
    return;
  }
  window.history.pushState({}, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
