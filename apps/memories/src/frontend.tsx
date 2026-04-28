/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 *
 * It is included in `src/index.html`.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "../styles/globals.css";

/**
 * Browsers may surface this as an ErrorEvent when a ResizeObserver pass cannot
 * deliver every notification in one frame (e.g. R3F + Popover reflow in the
 * same tick). The message is often
 * "ResizeObserver loop completed with undelivered notifications."
 * It is not an app bug. We absorb it in the capture phase so dev tooling
 * (Bun, Vite overlay) does not treat it as a hard failure; use capture so we
 * run before other listeners.
 */
function isBenignResizeObserverError(event: ErrorEvent | Event): boolean {
  const fromMessage =
    typeof (event as ErrorEvent).message === "string" &&
    (event as ErrorEvent).message.toLowerCase().includes("resizeobserver");
  if (fromMessage) return true;
  const err = (event as ErrorEvent).error;
  return err instanceof Error && err.message.toLowerCase().includes("resizeobserver");
}

window.addEventListener(
  "error",
  (e) => {
    if (isBenignResizeObserverError(e)) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  },
  true,
);

window.addEventListener("unhandledrejection", (e) => {
  const reason = e.reason;
  const msg = typeof reason === "string" ? reason : reason instanceof Error ? reason.message : "";
  if (msg.toLowerCase().includes("resizeobserver")) {
    e.preventDefault();
    e.stopPropagation();
  }
});

const elem = document.getElementById("root");
if (!elem) {
  throw new Error("Root element not found");
}
const app = (
  <StrictMode>
    <App />
  </StrictMode>
);

if (import.meta.hot) {
  // With hot module reloading, `import.meta.hot.data` is persisted.
  const root = import.meta.hot.data.root ?? createRoot(elem);
  root.render(app);
} else {
  // The hot module reloading API is not available in production.
  createRoot(elem).render(app);
}
