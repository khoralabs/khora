import { requireRegistrySession } from "../auth/require-session.js";
import { logger } from "../logger.js";

type ClientEventBody = {
  event?: string;
  props?: Record<string, unknown>;
};

type UmamiConfig = { url: string; websiteId: string };

function getUmamiConfig(): UmamiConfig | null {
  const url = process.env.UMAMI_URL?.trim();
  const websiteId = process.env.UMAMI_WEBSITE_ID?.trim();
  if (!url || !websiteId) return null;
  return { url, websiteId };
}

async function forwardToUmami(
  umami: UmamiConfig,
  event: string,
  props: Record<string, unknown>,
  hostname: string,
  userId: string | undefined,
): Promise<void> {
  const batch: unknown[] = [];

  if (userId !== undefined) {
    batch.push({ type: "identify", payload: { website: umami.websiteId, hostname, id: userId } });
  }

  batch.push({
    type: "event",
    payload: {
      website: umami.websiteId,
      hostname,
      url: `/events/${event}`,
      name: event,
      ...(Object.keys(props).length > 0 ? { data: props } : {}),
    },
  });

  await fetch(`${umami.url}/api/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "exedra/1.0" },
    body: JSON.stringify(batch),
  });
}

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

  const umami = getUmamiConfig();
  if (umami !== null) {
    const hostname = new URL(req.url).hostname;

    let userId: string | undefined;
    try {
      const session = await requireRegistrySession(req);
      userId = session?.user.id;
    } catch {
      // non-fatal — forward event without identity
    }

    void forwardToUmami(umami, event, props, hostname, userId).catch((err) => {
      logger.warn({ err: String(err) }, "umami.forward.error");
    });
  }

  return Response.json({ ok: true });
}
