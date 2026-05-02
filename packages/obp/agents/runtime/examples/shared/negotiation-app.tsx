import { GraphSnapshotFlow } from "@cfd/obp-react";
import type { ReactNode } from "react";
import {
  NegotiationExampleProvider,
  useNegotiationExample,
} from "./negotiation-hooks/negotiation-example-provider.tsx";

export { joinScenarioApi } from "./negotiation-hooks/utils.ts";
export {
  NegotiationExampleProvider,
  useNegotiationExample,
  type NegotiationExampleContextValue,
} from "./negotiation-hooks/negotiation-example-provider.tsx";

export type NegotiationAppProps = {
  /** e.g. `/api/scenarios/bilateral` — health/state/turn/reset are under this prefix */
  apiBase: string;
};

function NegotiationAppShell() {
  const {
    health,
    server,
    error,
    activity,
    lastLogLine,
    resetBusy,
    partyButtonState: btn,
    lastTurnFocusNodeIds,
    displayNames,
    onReset,
    onBuyer,
    onSeller,
  } = useNegotiationExample();

  const readyHint = `Ready — click ${displayNames.buyer} or ${displayNames.seller} to run the LLM.`;

  return (
    <div className="negotiation-shell">
      <div className="negotiation-main negotiation-main--stack">
        <div className="negotiation-toolbar">
          <p
            className={`toolbar-log${lastLogLine === null ? " toolbar-log--muted" : ""}`}
            role="status"
            aria-live="polite"
          >
            {lastLogLine ?? readyHint}
          </p>
          <div className="toolbar-actions">
            <button
              id="negotiation-reset"
              type="button"
              className="btn-toolbar-reset"
              disabled={!server || resetBusy}
              onClick={() => void onReset()}
            >
              Reset
            </button>
            <button
              id="buyer-turn"
              type="button"
              className={btn.buyerNext ? "btn-next" : undefined}
              disabled={btn.buyerDisabled || !server}
              aria-label={`Run LLM turn for ${displayNames.buyer}`}
              onClick={() => void onBuyer()}
            >
              {displayNames.buyer} (LLM)
            </button>
            <button
              id="seller-turn"
              type="button"
              className={btn.sellerNext ? "btn-next" : undefined}
              disabled={btn.sellerDisabled || !server}
              aria-label={`Run LLM turn for ${displayNames.seller}`}
              onClick={() => void onSeller()}
            >
              {displayNames.seller} (LLM)
            </button>
          </div>
        </div>

        <div id="llm-banner">
          {health && !health.llmReady ? (
            <p className="err">
              <strong>No LLM key.</strong> Set <code>GOOGLE_GENERATIVE_AI_API_KEY</code>,{" "}
              <code>GOOGLE_API_KEY</code>, or <code>GEMINI_API_KEY</code> for the server.
            </p>
          ) : null}
        </div>

        <p
          id="activity"
          className="activity"
          role="status"
          aria-live="polite"
          hidden={activity === null || activity === ""}
        >
          {activity ?? ""}
        </p>

        <div id="err" className="err">
          {error}
        </div>

        <section className="panel panel--dag" aria-label="Negotiation graph">
          {server ? (
            <GraphSnapshotFlow.Root graph={server.graph} focusNodeIds={lastTurnFocusNodeIds}>
              <GraphSnapshotFlow.Viewport>
                <GraphSnapshotFlow.Background />
                <GraphSnapshotFlow.Controls />
                <GraphSnapshotFlow.SelectionPanel />
              </GraphSnapshotFlow.Viewport>
            </GraphSnapshotFlow.Root>
          ) : (
            <div className="graph-wrap graph-wrap--dag-placeholder">
              <p className="row">
                <em>Loading graph…</em>
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export function NegotiationApp({ apiBase }: NegotiationAppProps): ReactNode {
  return (
    <NegotiationExampleProvider apiBase={apiBase}>
      <NegotiationAppShell />
    </NegotiationExampleProvider>
  );
}
