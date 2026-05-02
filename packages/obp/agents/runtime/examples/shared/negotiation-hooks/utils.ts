import type { HealthResponse, PartyDisplayNames, StateResponse } from "../negotiation-types.ts";

export const TURN_RETRY_MAX = 5;
export const TURN_RETRY_BASE_MS = 1200;

export function joinScenarioApi(base: string, segment: string): string {
  const b = base.replace(/\/$/, "");
  const s = segment.replace(/^\//, "");
  return `${b}/${s}`;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isAbortLike(e: unknown): boolean {
  if (e instanceof DOMException && (e.name === "AbortError" || e.name === "TimeoutError")) {
    return true;
  }
  return e instanceof Error && e.name === "AbortError";
}

export function logTimestamp(): string {
  try {
    return new Date().toISOString().slice(11, 19);
  } catch {
    return "??:??:??";
  }
}

export function roleDisplayName(names: PartyDisplayNames, role: "buyer" | "seller"): string {
  return role === "buyer" ? names.buyer : names.seller;
}

export function focusFlowNodeIdsForLastTurn(s: StateResponse): string[] | null {
  const last = s.audits.at(-1);
  if (last === undefined) {
    return null;
  }
  return [`offer:${last.newOfferId}`, ...last.exposedPortIds.map((id) => `port:${id}`)];
}

export function derivePartyButtonState(
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

export type TurnFailure = {
  ok: false;
  message: string;
  httpStatus?: number;
  errorCode?: string;
};

export type TurnPostResult = { ok: true; state: StateResponse } | TurnFailure;

export function shouldRetryTurnFailure(f: TurnFailure): boolean {
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

export const defaultPartyDisplayNames: PartyDisplayNames = {
  buyer: "Buyer",
  seller: "Seller",
};
