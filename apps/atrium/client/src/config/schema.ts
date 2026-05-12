import z from "zod";
import { ATRIUM_BUILTIN_PLUGIN_ID } from "../atrium-plugins.ts";

const zProfileSyncOptions = z
  .object({
    filePath: z
      .string({ message: "profile-sync filePath is required" })
      .describe("Path to the profile JSON file. Resolved against dataDir when relative."),
    pollIntervalMs: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Re-flush interval (ms). Omit to only flush on subscribed events."),
    debounceMs: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe("Coalesce burst events (ms). Default 750."),
  })
  .describe("Options for the profile-sync plugin.");

const zTelemetryOptions = z
  .object({
    dir: z
      .string({ message: "telemetry dir is required" })
      .describe("Directory for rotated JSONL telemetry. Resolved against dataDir when relative."),
    maxFileBytes: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Rotate when the next line would exceed this size. Default 4194304 (4 MiB)."),
  })
  .describe("Options for the telemetry plugin.");

const zInboxBufferOptions = z
  .object({
    dbPath: z
      .string({ message: "inbox-buffer dbPath is required" })
      .describe(
        "SQLite file path. Resolved against dataDir when relative. Use ':memory:' for ephemeral runs.",
      ),
    compactAfterAppend: z.boolean().optional().describe("Run compactPolicy after every append."),
    compactPolicy: z
      .object({
        maxEntries: z
          .number()
          .int()
          .positive()
          .describe("Cap on retained rows; oldest dropped first."),
        dropEventTypes: z
          .array(z.string())
          .optional()
          .describe("Indexed eviction by stored event_type."),
      })
      .optional()
      .describe("Eviction policy applied after each append (or on demand)."),
  })
  .describe("Options for the inbox-buffer plugin.");

/**
 * Per-id plugin map. Each id resolves to either the plugin's options or `false`. Setting an id to
 * `false` in a later layer cancels an entry contributed by an earlier layer.
 *
 * The known builtin ids are statically typed; passthrough lets hosts add third-party ids that
 * their own plugin registry can interpret.
 */
export const zAtriumAppPluginMap = z
  .object({
    [ATRIUM_BUILTIN_PLUGIN_ID.profileSync]: z
      .union([zProfileSyncOptions, z.literal(false)])
      .optional()
      .describe("profile-sync plugin options, or false to disable an inherited entry."),
    [ATRIUM_BUILTIN_PLUGIN_ID.telemetry]: z
      .union([zTelemetryOptions, z.literal(false)])
      .optional()
      .describe("telemetry plugin options, or false to disable an inherited entry."),
    [ATRIUM_BUILTIN_PLUGIN_ID.inboxBuffer]: z
      .union([zInboxBufferOptions, z.literal(false)])
      .optional()
      .describe("inbox-buffer plugin options, or false to disable an inherited entry."),
  })
  .passthrough()
  .describe("Builtin Atrium plugins keyed by id.");

export type AtriumAppPluginMap = z.infer<typeof zAtriumAppPluginMap>;

/**
 * Reusable base schema for any `@khoralabs/atrium-client` consumer. Top-level is `passthrough` so a
 * single JSON file can serve multiple hosts; each host parses with its own extended schema and
 * receives just the fields it knows.
 */
export const zAtriumAppConfigBase = z
  .object({
    $schema: z
      .string()
      .optional()
      .describe(
        "Path or URL to atrium-config.schema.json. Purely for editor IntelliSense; ignored at runtime.",
      ),
    extends: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe(
        "Path(s) to base config files relative to this file. Recursively resolved; deeper bases merge first.",
      ),
    baseUrl: z
      .string()
      .url({ message: "baseUrl must be a valid URL" })
      .optional()
      .describe("Atrium host base URL. Default: http://127.0.0.1:8787"),
    agentKeyPath: z
      .string()
      .optional()
      .describe("Override path to the Ed25519 identity file. Default: ~/.atrium/identity.json"),
    dataDir: z
      .string()
      .optional()
      .describe("Root directory for relative plugin paths (filePath, dir, dbPath)."),
    daemonJson: z
      .boolean()
      .optional()
      .describe("(daemon only) Emit JSON lines instead of pretty-printed events."),
    plugins: zAtriumAppPluginMap
      .optional()
      .describe(
        "Builtin plugins by id. Merged across layers per-id; set an id to false to cancel.",
      ),
  })
  .passthrough()
  .describe("Atrium client base configuration.");

export type AtriumAppConfigBase = z.infer<typeof zAtriumAppConfigBase>;

/**
 * Canonical extension entry point so every host extends the same way. The returned schema is
 * passthrough (matching the base), so foreign top-level keys remain available for the host that
 * understands them.
 */
export function extendAtriumAppConfig<TExt extends z.ZodRawShape>(extension: TExt) {
  return zAtriumAppConfigBase.extend(extension);
}

/** Shorthand for `z.infer<typeof Schema>` so hosts don't need a direct zod dependency. */
export type InferAtriumAppConfig<TSchema extends z.ZodTypeAny> = z.infer<TSchema>;
