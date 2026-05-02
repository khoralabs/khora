import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NegotiationFlow } from "./negotiation-flow.tsx";
import { NEGOTIATION_TURN_FETCH_TIMEOUT_MS } from "./negotiation-timeouts.ts";
import type { HealthResponse, StateResponse } from "./negotiation-types.ts";

const TURN_RETRY_MAX = 5;
const TURN_RETRY_BASE_MS = 1200;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type TurnFailure = {
  ok: false;
  message: string;
  httpStatus?: number;
  errorCode?: string;
};

type TurnPostResult = { ok: true; state: StateResponse } | TurnFailure;

function shouldRetryTurnFailure(f: TurnFailure): boolean {
  if (f.httpStatus === undefined) {
    return true;
  }
  if (f.httpStatus === 422) {
    return true;
  }
  if (f.httpStatus >= 500 && f.httpStatus <= 599) {
    if (f.httpStatus === 503 && f.errorCode === "llm_not_configured") {
      return false;
    }
    return true;
  }
  return false;
}

function ts(): string {
  try {
    return new Date().toISOString().slice(11, 19);
  } catch {
    return "??:??:??";
  }
}

function isAbortLike(e: unknown): boolean {
  if (e instanceof DOMException && (e.name === "AbortError" || e.name === "TimeoutError")) {
    return true;
  }
  return e instanceof Error && e.name === "AbortError";
}

async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch("/api/health");
  if (!res.ok) {
    throw new Error(`GET /api/health ${res.status}`);
  }
  return (await res.json()) as HealthResponse;
}

async function fetchState(): Promise<StateResponse> {
  const res = await fetch("/api/state");
  if (!res.ok) {
    throw new Error(`GET /api/state ${res.status}`);
  }
  return (await res.json()) as StateResponse;
}

function deriveButtonState(
  s: StateResponse | null,
  h: HealthResponse | null,
  busy: boolean,
): {
  buyerDisabled: boolean;
  sellerDisabled: boolean;
  buyerNext: boolean;
  sellerNext: boolean;
} {
  if (!s || !h || busy) {
    return { buyerDisabled: true, sellerDisabled: true, buyerNext: false, sellerNext: false };
  }
  const globallyOff =
    !h.llmReady || !s.llmConfigured || s.negotiationEnded || s.turnsCompleted >= s.maxTurns;
  if (globallyOff) {
    return { buyerDisabled: true, sellerDisabled: true, buyerNext: false, sellerNext: false };
  }
  const nt = s.nextTurn;
  if (nt !== null) {
    const wantBuyer = nt.actingRole === "buyer";
    return {
      buyerDisabled: !wantBuyer,
      sellerDisabled: wantBuyer,
      buyerNext: wantBuyer,
      sellerNext: !wantBuyer,
    };
  }
  return { buyerDisabled: false, sellerDisabled: false, buyerNext: false, sellerNext: false };
}

/** React Flow node ids for the offer + ports introduced on the last completed turn. */
function focusFlowNodeIdsForLastTurn(s: StateResponse): string[] | null {
  const last = s.audits.at(-1);
  if (last === undefined) {
    return null;
  }
  return [`offer:${last.newOfferId}`, ...last.exposedPortIds.map((id) => `port:${id}`)];
}

export function NegotiationApp() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [server, setServer] = useState<StateResponse | null>(null);
  const [error, setError] = useState("");
  const [activity, setActivity] = useState<string | null>(null);
  const [lastLogLine, setLastLogLine] = useState<string | null>(null);
  const [turnBusy, setTurnBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  /** Bumped when the user resets the session so in-flight auto-run loops exit cleanly. */
  const sessionGenerationRef = useRef(0);

  const appendLog = useCallback((message: string) => {
    setLastLogLine(`${ts()} ${message}`);
  }, []);

  const lastTurnFocusNodeIds = useMemo(() => {
    if (server === null) {
      return null;
    }
    return focusFlowNodeIdsForLastTurn(server);
  }, [server]);

  const refresh = useCallback(
    async (opts?: { clearError?: boolean }) => {
      const clearError = opts?.clearError !== false;
      if (clearError) {
        setError("");
      }
      try {
        const h = await fetchHealth();
        const s = await fetchState();
        setHealth(h);
        setServer(s);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        appendLog(`✗ refresh: ${msg}`);
      }
    },
    [appendLog],
  );

  type ExecuteTurnOpts = {
    /** Called every 5s while waiting on the server (elapsed seconds). */
    onWaitingTick?: (elapsedSec: number) => void;
  };

  const executeOneTurn = useCallback(
    async (actingPartyId: string, opts?: ExecuteTurnOpts): Promise<TurnPostResult> => {
      let tick: ReturnType<typeof setInterval> | undefined;
      const onWaitingTick = opts?.onWaitingTick;
      if (onWaitingTick) {
        const t0 = Date.now();
        tick = setInterval(() => onWaitingTick(Math.floor((Date.now() - t0) / 1000)), 5000);
      }
      try {
        const res = await fetch("/api/negotiation/turn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actingPartyId }),
          signal: AbortSignal.timeout(NEGOTIATION_TURN_FETCH_TIMEOUT_MS),
        });
        let body: {
          ok?: boolean;
          error?: string;
          expectedParty?: string;
          state?: StateResponse;
        };
        try {
          body = (await res.json()) as typeof body;
        } catch {
          return {
            ok: false,
            message: `Non-JSON response HTTP ${res.status}`,
            httpStatus: res.status,
          };
        }
        if (!res.ok || body.ok === false) {
          const extra = body.expectedParty ? ` (expected: ${body.expectedParty})` : "";
          const msg = `${body.error ?? "error"} HTTP ${res.status}${extra}`;
          return {
            ok: false,
            message: msg,
            httpStatus: res.status,
            errorCode: body.error,
          };
        }
        const h = await fetchHealth();
        setHealth(h);
        if (body.state) {
          setServer(body.state);
          return { ok: true, state: body.state };
        }
        const s = await fetchState();
        setServer(s);
        return { ok: true, state: s };
      } catch (e) {
        if (isAbortLike(e)) {
          const min = Math.ceil(NEGOTIATION_TURN_FETCH_TIMEOUT_MS / 60_000);
          return {
            ok: false,
            message: `Turn request timed out after ~${min} min (LLM still slow or unreachable — check API key and model)`,
          };
        }
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, message: msg };
      } finally {
        if (tick !== undefined) {
          clearInterval(tick);
        }
      }
    },
    [],
  );

  const executeOneTurnWithRetries = useCallback(
    async (
      actingPartyId: string,
      actingRole: "buyer" | "seller",
      executeOpts?: ExecuteTurnOpts,
    ): Promise<TurnPostResult> => {
      let last: TurnPostResult = { ok: false, message: "no attempt" };
      for (let attempt = 1; attempt <= TURN_RETRY_MAX; attempt++) {
        last = await executeOneTurn(actingPartyId, executeOpts);
        if (last.ok) {
          return last;
        }
        const canRetry = shouldRetryTurnFailure(last) && attempt < TURN_RETRY_MAX;
        if (!canRetry) {
          return last;
        }
        const wait = TURN_RETRY_BASE_MS * 2 ** (attempt - 1);
        appendLog(
          `⚠ ${actingRole}: attempt ${attempt}/${TURN_RETRY_MAX} failed, retry in ${wait}ms — ${last.message}`,
        );
        setActivity(`Retry ${attempt + 1}/${TURN_RETRY_MAX} after ${wait}ms…`);
        await delay(wait);
      }
      return last;
    },
    [appendLog, executeOneTurn],
  );

  useEffect(() => {
    void refresh().then(() => {
      appendLog("Page loaded · click the highlighted party once to run until completion.");
    });
  }, [refresh, appendLog]);

  const btn = deriveButtonState(server, health, turnBusy);

  const runAutoNegotiation = useCallback(
    async (clickedRole: "buyer" | "seller") => {
      if (turnBusy || !server || !health) {
        return;
      }
      const genAtStart = sessionGenerationRef.current;
      const stale = () => sessionGenerationRef.current !== genAtStart;

      const nt0 = server.nextTurn;
      if (nt0 !== null && nt0.actingRole !== clickedRole) {
        appendLog("(ignored: use the highlighted party to start)");
        return;
      }

      setTurnBusy(true);
      setError("");
      appendLog(`→ Auto-run started (${clickedRole} next)…`);

      try {
        let s = server;

        while (true) {
          if (stale()) {
            appendLog("Auto-run stopped (session reset).");
            break;
          }
          if (!s.llmConfigured) {
            appendLog("✗ Auto-run stopped: LLM not configured.");
            break;
          }
          if (s.negotiationEnded || s.turnsCompleted >= s.maxTurns || s.agreementReached) {
            appendLog("✓ Auto-run: negotiation already completed.");
            break;
          }
          if (s.nextTurn === null) {
            appendLog("✓ Auto-run: no next turn.");
            break;
          }

          const { actingPartyId, actingRole } = s.nextTurn;
          setActivity(`Auto-run: ${actingRole} · ${s.turnsCompleted + 1}/${s.maxTurns}…`);
          appendLog(`→ ${actingRole}: LLM turn starting…`);

          const r = await executeOneTurnWithRetries(actingPartyId, actingRole, {
            onWaitingTick: (sec) => {
              setActivity(
                `Auto-run: ${actingRole} · ${s.turnsCompleted + 1}/${s.maxTurns} · waiting ${sec}s…`,
              );
            },
          });
          if (stale()) {
            appendLog("Auto-run stopped (session reset).");
            break;
          }
          if (!r.ok) {
            appendLog(`✗ ${actingRole}: ${r.message}`);
            setError(r.message);
            await refresh({ clearError: false });
            break;
          }

          s = r.state;
          appendLog(`✓ ${actingRole}: ok · turns ${s.turnsCompleted}/${s.maxTurns}`);
          if (s.agreementReached) {
            appendLog("✓ Agreement reached (terminal bind).");
          }

          if (
            s.negotiationEnded ||
            s.turnsCompleted >= s.maxTurns ||
            s.agreementReached ||
            s.nextTurn === null
          ) {
            appendLog("✓ Auto-run finished.");
            break;
          }
        }
      } finally {
        setTurnBusy(false);
        setActivity(null);
      }
    },
    [turnBusy, server, health, appendLog, executeOneTurnWithRetries, refresh],
  );

  const onBuyer = () => {
    void runAutoNegotiation("buyer");
  };

  const onSeller = () => {
    void runAutoNegotiation("seller");
  };

  const onReset = useCallback(async () => {
    if (!server) {
      return;
    }
    sessionGenerationRef.current += 1;
    setResetBusy(true);
    setError("");
    try {
      const res = await fetch("/api/negotiation/reset", { method: "POST" });
      let body: { ok?: boolean; error?: string; state?: StateResponse };
      try {
        body = (await res.json()) as typeof body;
      } catch {
        appendLog(`✗ reset: non-JSON HTTP ${res.status}`);
        await refresh({ clearError: false });
        return;
      }
      if (!res.ok || body.ok === false || !body.state) {
        const msg = body.error ?? `HTTP ${res.status}`;
        setError(msg);
        appendLog(`✗ reset: ${msg}`);
        await refresh({ clearError: false });
        return;
      }
      setServer(body.state);
      const h = await fetchHealth();
      setHealth(h);
      appendLog("↺ Session reset — empty graph.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      appendLog(`✗ reset: ${msg}`);
    } finally {
      setResetBusy(false);
    }
  }, [appendLog, refresh, server]);

  return (
    <div className="negotiation-shell">
      <div className="negotiation-main negotiation-main--stack">
        <div className="negotiation-toolbar">
          <p
            className={`toolbar-log${lastLogLine === null ? " toolbar-log--muted" : ""}`}
            role="status"
            aria-live="polite"
          >
            {lastLogLine ?? "Ready — click Buyer or Seller to run the LLM."}
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
              onClick={() => void onBuyer()}
            >
              Buyer (LLM)
            </button>
            <button
              id="seller-turn"
              type="button"
              className={btn.sellerNext ? "btn-next" : undefined}
              disabled={btn.sellerDisabled || !server}
              onClick={() => void onSeller()}
            >
              Seller (LLM)
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
            <NegotiationFlow
              key={server.partyIds.buyer}
              graph={server.graph}
              focusNodeIds={lastTurnFocusNodeIds}
            />
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
