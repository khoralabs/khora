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
 * The browser fires this as a real ErrorEvent when a ResizeObserver callback
 * triggers layout changes that couldn't all be delivered in one frame. This is
 * benign — it means "some notifications were queued for next frame", not "something
 * broke". R3F's react-use-measure fires on any document reflow (not just actual
 * canvas resizes), so CSS animations on Portal content (e.g. the Popover) can
 * trigger this in the same frame as the canvas resize callback. Suppressing the
 * event here stops Bun dev-server from relaying it as a "frontend error".
 */
window.addEventListener("error", (e) => {
  if (e.message.includes("ResizeObserver loop")) {
    e.stopImmediatePropagation();
    e.preventDefault();
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
