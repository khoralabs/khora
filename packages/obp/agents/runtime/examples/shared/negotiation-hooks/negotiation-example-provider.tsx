import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { NEGOTIATION_TURN_FETCH_TIMEOUT_MS } from "../negotiation-timeouts.ts";
import type { HealthResponse, PartyDisplayNames, StateResponse } from "../negotiation-types.ts";
import {
  defaultPartyDisplayNames,
  delay,
  derivePartyButtonState,
  focusFlowNodeIdsForLastTurn,
  isAbortLike,
  joinScenarioApi,
  logTimestamp,
  roleDisplayName,
  shouldRetryTurnFailure,
  TURN_RETRY_BASE_MS,
  TURN_RETRY_MAX,
  type TurnPostResult,
} from "./utils.ts";

export type NegotiationExampleContextValue = {
  apiBase: string;
  api: { health: string; state: string; turn: string; reset: string };
  health: HealthResponse | null;
  server: StateResponse | null;
  error: string;
  activity: string | null;
  lastLogLine: string | null;
  turnBusy: boolean;
  resetBusy: boolean;
  refresh: (opts?: { clearError?: boolean }) => Promise<void>;
  onReset: () => Promise<void>;
  onBuyer: () => void;
  onSeller: () => void;
  partyButtonState: ReturnType<typeof derivePartyButtonState>;
  lastTurnFocusNodeIds: string[] | null;
  displayNames: PartyDisplayNames;
};

const NegotiationExampleContext = createContext<NegotiationExampleContextValue | null>(null);

export function useNegotiationExample(): NegotiationExampleContextValue {
  const v = useContext(NegotiationExampleContext);
  if (v === null) {
    throw new Error("useNegotiationExample must be used within NegotiationExampleProvider");
  }
  return v;
}

type ExecuteTurnOpts = {
  onWaitingTick?: (elapsedSec: number) => void;
};

export function NegotiationExampleProvider({
  apiBase,
  children,
}: {
  apiBase: string;
  children: ReactNode;
}) {
  const api = useMemo(
    () => ({
      health: joinScenarioApi(apiBase, "health"),
      state: joinScenarioApi(apiBase, "state"),
      turn: joinScenarioApi(apiBase, "negotiation/turn"),
      reset: joinScenarioApi(apiBase, "negotiation/reset"),
    }),
    [apiBase],
  );

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [server, setServer] = useState<StateResponse | null>(null);
  const serverRef = useRef<StateResponse | null>(null);
  useEffect(() => {
    serverRef.current = server;
  }, [server]);

  const [error, setError] = useState("");
  const [activity, setActivity] = useState<string | null>(null);
  const [lastLogLine, setLastLogLine] = useState<string | null>(null);
  const [turnBusy, setTurnBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const sessionGenerationRef = useRef(0);

  const displayNames = server?.partyDisplayNames ?? defaultPartyDisplayNames;

  const appendLog = useCallback((message: string) => {
    setLastLogLine(`${logTimestamp()} ${message}`);
  }, []);

  const lastTurnFocusNodeIds = useMemo(() => {
    if (server === null) {
      return null;
    }
    return focusFlowNodeIdsForLastTurn(server);
  }, [server]);

  const fetchHealth = useCallback(async (): Promise<HealthResponse> => {
    const res = await fetch(api.health);
    if (!res.ok) {
      throw new Error(`GET ${api.health} ${res.status}`);
    }
    return (await res.json()) as HealthResponse;
  }, [api.health]);

  const fetchState = useCallback(async (): Promise<StateResponse> => {
    const res = await fetch(api.state);
    if (!res.ok) {
      throw new Error(`GET ${api.state} ${res.status}`);
    }
    return (await res.json()) as StateResponse;
  }, [api.state]);

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
    [appendLog, fetchHealth, fetchState],
  );

  const executeOneTurn = useCallback(
    async (actingPartyId: string, opts?: ExecuteTurnOpts): Promise<TurnPostResult> => {
      let tick: ReturnType<typeof setInterval> | undefined;
      const onWaitingTick = opts?.onWaitingTick;
      if (onWaitingTick) {
        const t0 = Date.now();
        tick = setInterval(() => onWaitingTick(Math.floor((Date.now() - t0) / 1000)), 5000);
      }
      try {
        const res = await fetch(api.turn, {
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
    [api.turn, fetchHealth, fetchState],
  );

  const executeOneTurnWithRetries = useCallback(
    async (
      actingPartyId: string,
      actingRole: "buyer" | "seller",
      executeOpts?: ExecuteTurnOpts,
    ): Promise<TurnPostResult> => {
      const names = serverRef.current?.partyDisplayNames ?? defaultPartyDisplayNames;
      const roleLabel = roleDisplayName(names, actingRole);
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
          `⚠ ${roleLabel}: attempt ${attempt}/${TURN_RETRY_MAX} failed, retry in ${wait}ms — ${last.message}`,
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

  const partyButtonState = derivePartyButtonState(server, health, turnBusy);

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

      const names0 = server.partyDisplayNames;
      const clickedLabel = roleDisplayName(names0, clickedRole);

      setTurnBusy(true);
      setError("");
      appendLog(`→ Auto-run started (${clickedLabel} next)…`);

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
          const names = s.partyDisplayNames;
          const actingLabel = roleDisplayName(names, actingRole);
          setActivity(`Auto-run: ${actingLabel} · ${s.turnsCompleted + 1}/${s.maxTurns}…`);
          appendLog(`→ ${actingLabel}: LLM turn starting…`);

          const r = await executeOneTurnWithRetries(actingPartyId, actingRole, {
            onWaitingTick: (sec) => {
              setActivity(
                `Auto-run: ${actingLabel} · ${s.turnsCompleted + 1}/${s.maxTurns} · waiting ${sec}s…`,
              );
            },
          });
          if (stale()) {
            appendLog("Auto-run stopped (session reset).");
            break;
          }
          if (!r.ok) {
            appendLog(`✗ ${actingLabel}: ${r.message}`);
            setError(r.message);
            await refresh({ clearError: false });
            break;
          }

          s = r.state;
          appendLog(`✓ ${actingLabel}: ok · turns ${s.turnsCompleted}/${s.maxTurns}`);
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

  const onBuyer = useCallback(() => {
    void runAutoNegotiation("buyer");
  }, [runAutoNegotiation]);

  const onSeller = useCallback(() => {
    void runAutoNegotiation("seller");
  }, [runAutoNegotiation]);

  const onReset = useCallback(async () => {
    if (!server) {
      return;
    }
    sessionGenerationRef.current += 1;
    setResetBusy(true);
    setError("");
    try {
      const res = await fetch(api.reset, { method: "POST" });
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
  }, [appendLog, refresh, server, api.reset, fetchHealth]);

  const value = useMemo(
    (): NegotiationExampleContextValue => ({
      apiBase,
      api,
      health,
      server,
      error,
      activity,
      lastLogLine,
      turnBusy,
      resetBusy,
      refresh,
      onReset,
      onBuyer,
      onSeller,
      partyButtonState,
      lastTurnFocusNodeIds,
      displayNames,
    }),
    [
      apiBase,
      api,
      health,
      server,
      error,
      activity,
      lastLogLine,
      turnBusy,
      resetBusy,
      refresh,
      onReset,
      onBuyer,
      onSeller,
      partyButtonState,
      lastTurnFocusNodeIds,
      displayNames,
    ],
  );

  return (
    <NegotiationExampleContext.Provider value={value}>{children}</NegotiationExampleContext.Provider>
  );
}
