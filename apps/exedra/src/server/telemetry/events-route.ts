import { logger } from "../logger.js";

type ClientEventBody = {
  event?: string;
  props?: Record<string, unknown>;
};

export async function handlePostClientEvent(req: Request): Promise<Response> {
  let body: ClientEventBody;
  try {
    body = (await req.json()) as ClientEventBody;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = body.event?.trim() ?? "";
  if (event.length === 0) {
    return Response.json({ error: "event is required" }, { status: 400 });
  }

  const props =
    body.props !== undefined && typeof body.props === "object" && body.props !== null
      ? body.props
      : {};

  logger.info({ clientEvent: event, ...props }, "client.event");
  return Response.json({ ok: true });
}
