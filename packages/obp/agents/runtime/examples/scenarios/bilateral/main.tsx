import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { NegotiationApp } from "../../shared/negotiation-app.tsx";

const rootEl = document.getElementById("root");
if (rootEl === null) {
  throw new Error("Bilateral scenario: missing #root");
}

createRoot(rootEl).render(
  <StrictMode>
    <div className="scenario-run">
      <nav className="scenario-run__nav">
        <a href="/">← All scenarios</a>
      </nav>
      <NegotiationApp apiBase="/api/scenarios/bilateral" />
    </div>
  </StrictMode>,
);
