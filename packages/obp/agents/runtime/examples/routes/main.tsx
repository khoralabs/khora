import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

const rootEl = document.getElementById("root");
if (rootEl === null) {
  throw new Error("Examples home: missing #root");
}

function Home() {
  return (
    <main className="scenario-home">
      <h1>OBP agent-runtime examples</h1>
      <p className="scenario-home__lead">
        Each scenario runs an isolated in-memory negotiation with its own HTTP API prefix.
      </p>
      <ul>
        <li>
          <a href="/scenarios/bilateral">
            Bilateral pilot delivery
            <small>
              Shared analytics-slice delivery; classic buyer/seller private intents (original demo).
            </small>
          </a>
        </li>
        <li>
          <a href="/scenarios/intent-overlap">
            Intent overlap
            <small>
              Two parties probe fit when goals partially align but one prefers breadth/speed and the
              other depth/risk control.
            </small>
          </a>
        </li>
      </ul>
    </main>
  );
}

createRoot(rootEl).render(
  <StrictMode>
    <Home />
  </StrictMode>,
);
