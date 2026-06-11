const SLACK_MESSAGE_MAX = 3000;

type SlackContactResult = { ok: true } | { ok: false; error: string };

function truncateForSlack(text: string): string {
  if (text.length <= SLACK_MESSAGE_MAX) return text;
  return `${text.slice(0, SLACK_MESSAGE_MAX - 1)}…`;
}

export async function sendContactSlackMessage(params: {
  email: string;
  message: string;
  emailVerified: boolean;
  marketingConsent: boolean;
}): Promise<SlackContactResult> {
  const token = process.env.SLACK_BOT_TOKEN?.trim();
  const channel = process.env.SLACK_CONTACT_CHANNEL_ID?.trim();

  if (token === undefined || token.length === 0 || channel === undefined || channel.length === 0) {
    return { ok: false, error: "not_configured" };
  }

  const displayMessage = truncateForSlack(params.message);
  const emailStatus = params.emailVerified ? "Verified" : "Unconfirmed";
  const marketingStatus = params.marketingConsent ? "Yes" : "No";
  const fallbackText = `New contact form submission from ${params.email} (${emailStatus})`;

  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel,
      text: fallbackText,
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: "New contact form submission", emoji: true },
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*Email:*\n<mailto:${params.email}|${params.email}>`,
            },
            {
              type: "mrkdwn",
              text: `*Email status:*\n${emailStatus}`,
            },
            {
              type: "mrkdwn",
              text: `*Marketing opt-in:*\n${marketingStatus}`,
            },
          ],
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: `*Message:*\n${displayMessage}` },
        },
      ],
    }),
  });

  let body: { ok?: boolean; error?: string };
  try {
    body = (await res.json()) as { ok?: boolean; error?: string };
  } catch {
    return { ok: false, error: "invalid_response" };
  }

  if (!res.ok || body.ok !== true) {
    return { ok: false, error: body.error ?? `http_${res.status}` };
  }

  return { ok: true };
}
