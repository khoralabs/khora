import z from "zod";

/** Unix duplex handshake: session kind only; auth is multiplex bind after hello. */
const zInbox = z.object({
  kind: z.literal("inbox"),
});

export const zDuplexUnixHandshake = zInbox;

export type DuplexUnixHandshake = z.infer<typeof zDuplexUnixHandshake>;

/** Validate parsed JSON from the first handshake line (newline-terminated). */
export function parseDuplexUnixHandshakeJson(json: unknown): DuplexUnixHandshake {
  return zDuplexUnixHandshake.parse(json);
}
