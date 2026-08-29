import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

function showRootError(elem: HTMLElement, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error("[admin-ui]", err);
  elem.replaceChildren();
  const pre = document.createElement("pre");
  pre.className = "m-6 rounded-md border border-red-500/40 bg-red-950/20 p-4 text-sm text-red-200";
  pre.textContent = `Admin UI failed to start:\n${message}`;
  elem.append(pre);
}

if (typeof window !== "undefined") {
  const onFatal = (err: unknown) => {
    const elem = document.getElementById("root");
    if (elem !== null && elem.childElementCount === 0) {
      showRootError(elem, err);
    }
  };
  window.addEventListener("error", (event) => onFatal(event.error ?? event.message));
  window.addEventListener("unhandledrejection", (event) => onFatal(event.reason));
}

export function renderRoute(Component: React.ComponentType) {
  const elem = document.getElementById("root");
  if (elem === null) throw new Error("Root element not found");
  const app = (
    <StrictMode>
      <Component />
    </StrictMode>
  );
  try {
    if (import.meta.hot) {
      const root = import.meta.hot.data.root ?? createRoot(elem);
      import.meta.hot.data.root = root;
      root.render(app);
    } else {
      createRoot(elem).render(app);
    }
  } catch (err) {
    showRootError(elem, err);
  }
}
