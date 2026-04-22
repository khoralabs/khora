import { MemoriesPersistenceProvider } from "@cfd/memories-convex/react";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { type ReactNode, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { components } from "../../convex/_generated/api.js";

function Root({ children }: { children: ReactNode }) {
  // Client bundle only inlines names allowed by bunfig `[serve.static] env` (here: BUN_PUBLIC_*).
  // CONVEX_URL from .env is server-only unless you use `env = "inline"` or add a BUN_PUBLIC_ copy.
  const convexUrl = String(process.env.BUN_PUBLIC_CONVEX_URL?.trim() ?? "");
  if (!convexUrl) {
    throw new Error("Set BUN_PUBLIC_CONVEX_URL (e.g. in .env.local) to your Convex deployment URL");
  }
  const client = new ConvexReactClient(convexUrl);
  return (
    <ConvexProvider client={client}>
      <MemoriesPersistenceProvider componentApi={components.memories}>
        {children}
      </MemoriesPersistenceProvider>
    </ConvexProvider>
  );
}

export function renderApp(children: ReactNode) {
  const elem = document.getElementById("root");
  if (!elem) {
    throw new Error("Root element not found");
  }

  const app = (
    <StrictMode>
      <Root>{children}</Root>
    </StrictMode>
  );

  if (import.meta.hot) {
    const existingRoot = import.meta.hot.data.root as ReturnType<typeof createRoot> | undefined;
    const root = existingRoot ?? createRoot(elem);
    if (!existingRoot) {
      import.meta.hot.data.root = root;
    }
    root.render(app);
  } else {
    createRoot(elem).render(app);
  }
}
