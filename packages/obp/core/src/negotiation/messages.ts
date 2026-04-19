export type NegotiationToolCallRecord = {
  name: string;
  input: unknown;
  /** Tool output when execution succeeded. */
  result?: unknown;
  error?: string;
};

export type NegotiationMessage = {
  id: string;
  ts: number;
  authorPartyId: string;
  kind: "text" | "tool_call";
  /** Human-readable line (e.g. assistant text or tool summary). */
  content: string;
  toolCall?: NegotiationToolCallRecord;
};
