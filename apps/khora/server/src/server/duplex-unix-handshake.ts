import z from "zod";

const zInbox = z.object({
  kind: z.literal("inbox"),
  did: z.string().min(1),
  ts: z.string().min(1),
  nonce: z.string().min(1),
  sig: z.string().min(1),
});

export const zDuplexUnixHandshake = zInbox;

export type DuplexUnixHandshake = z.infer<typeof zDuplexUnixHandshake>;

/** Validate parsed JSON from the first handshake line (newline-terminated). */
export function parseDuplexUnixHandshakeJson(json: unknown): DuplexUnixHandshake {
  return zDuplexUnixHandshake.parse(json);
}
