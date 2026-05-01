import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { NegotiationApp } from "./negotiation-app.tsx";

const rootEl = document.getElementById("root");
if (rootEl === null) {
  throw new Error("Negotiation UI: missing #root – check examples/index.html");
}

createRoot(rootEl).render(
  <StrictMode>
    <NegotiationApp />
  </StrictMode>,
);
