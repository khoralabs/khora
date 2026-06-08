import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { RouteErrorBoundary } from "./route-error-boundary";

export function renderRoute<P extends Record<string, unknown>>(
  Component: React.ComponentType<P>,
  props?: P,
) {
  const elem = document.getElementById("root");
  if (!elem) throw new Error("Root element not found");
  const resolvedProps = (props ?? {}) as P;
  const app = (
    <StrictMode>
      <RouteErrorBoundary>
        <Component {...resolvedProps} />
      </RouteErrorBoundary>
    </StrictMode>
  );
  const hasSSR = elem.hasChildNodes();
  if (import.meta.hot) {
    const root = import.meta.hot.data.root ?? (hasSSR ? hydrateRoot(elem, app) : createRoot(elem));
    import.meta.hot.data.root = root;
    root.render(app);
  } else if (hasSSR) {
    hydrateRoot(elem, app);
  } else {
    createRoot(elem).render(app);
  }
}
