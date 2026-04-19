export type TranscriptStep =
  | { kind: "info"; label: string; data: Record<string, unknown> }
  | { kind: "obp"; op: string; ok: true; detail: Record<string, unknown> }
  | { kind: "obp"; op: string; ok: false; code: string; message: string };
