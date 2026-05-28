import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

export function renderRoute(Component: React.ComponentType) {
  const elem = document.getElementById("root");
  if (!elem) throw new Error("Root element not found");
  const app = (
    <StrictMode>
      <Component />
    </StrictMode>
  );
  if (import.meta.hot) {
    const root = import.meta.hot.data.root ?? createRoot(elem);
    root.render(app);
  } else {
    createRoot(elem).render(app);
  }
}
