import { logger } from "./logger";
import { sendContactSlackMessage } from "./slack-contact";

type PendingContact = {
  id: string;
  email: string;
  message: string;
  marketingConsent: boolean;
  sent: boolean;
  timer: ReturnType<typeof setTimeout>;
};

const pending = new Map<string, PendingContact>();

function queueTtlMs(): number {
  const seconds = Number.parseInt(process.env.CONTACT_QUEUE_TTL_SECONDS ?? "300", 10);
  return (Number.isFinite(seconds) && seconds > 0 ? seconds : 300) * 1000;
}

type FlushResult = { ok: true } | { ok: false; error: string };

async function flushContact(entry: PendingContact, emailVerified: boolean): Promise<FlushResult> {
  if (entry.sent) return { ok: true };

  entry.sent = true;
  clearTimeout(entry.timer);

  const result = await sendContactSlackMessage({
    email: entry.email,
    message: entry.message,
    emailVerified,
    marketingConsent: entry.marketingConsent,
  });

  if (!result.ok) {
    if (emailVerified) {
      entry.sent = false;
    } else {
      pending.delete(entry.id);
    }
    logger.error(
      {
        err: result.error,
        event: "contact.slack_failed",
        emailVerified,
        marketingConsent: entry.marketingConsent,
      },
      "contact_slack_failed",
    );
    return result;
  }

  pending.delete(entry.id);
  logger.info(
    { event: "contact.slack_sent", emailVerified, marketingConsent: entry.marketingConsent },
    "contact_slack_sent",
  );
  return { ok: true };
}

export function enqueueContact(params: {
  email: string;
  message: string;
  marketingConsent: boolean;
}): string {
  const id = crypto.randomUUID();
  const entry: PendingContact = {
    id,
    email: params.email,
    message: params.message,
    marketingConsent: params.marketingConsent,
    sent: false,
    timer: setTimeout(() => {
      void (async () => {
        const current = pending.get(id);
        if (current === undefined || current.sent) return;
        await flushContact(current, false);
      })();
    }, queueTtlMs()),
  };

  pending.set(id, entry);
  logger.info({ event: "contact.queued" }, "contact_queued");
  return id;
}

export async function confirmContact(id: string): Promise<FlushResult> {
  const entry = pending.get(id);
  if (entry === undefined) {
    return { ok: true };
  }

  clearTimeout(entry.timer);
  logger.info({ event: "contact.confirmed" }, "contact_confirmed");
  return flushContact(entry, true);
}

export function cancelContact(id: string): void {
  const entry = pending.get(id);
  if (entry === undefined) return;
  clearTimeout(entry.timer);
  pending.delete(id);
}
