import z from "zod";

/**
 * Shared Vellum app config (CLI + daemon). All fields optional — unset means
 * fall back to command-line flags / env / built-in defaults in each app.
 */
export const zVellumAppConfigBase = z
  .object({
    baseUrl: z.string().min(1).optional().describe("ATRIUM / Atrium-compatible HTTP host"),
    dataDir: z
      .string()
      .min(1)
      .optional()
      .describe("Vellum room data root (SQLite + vellum.json under …/obp/rooms/…)"),
    agentKeyPath: z
      .string()
      .min(1)
      .optional()
      .describe("Path to Ed25519 identity JSON (see agent-persisted-signer)"),
    defaultRoomId: z
      .string()
      .min(1)
      .optional()
      .describe("Default room id when --room / env not set"),
    defaultRoomWebSocketUrl: z
      .string()
      .min(1)
      .optional()
      .describe("Default room WebSocket URL when env not set"),
    daemonJson: z.boolean().optional().describe("JSON log lines from vellum-daemon"),
  })
  .strict();

export type VellumAppConfigBase = z.infer<typeof zVellumAppConfigBase>;
