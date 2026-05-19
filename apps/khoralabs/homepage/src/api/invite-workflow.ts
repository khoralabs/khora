import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { markEmailSent, setEmailIfAbsent, setTokenForEmail } from "./waitlist-store.ts";

function atriumBaseUrl(): string {
  const url = process.env.ATRIUM_BASE_URL?.trim();
  if (url === undefined || url.length === 0) {
    throw new Error("ATRIUM_BASE_URL is not configured");
  }
  return url.replace(/\/$/, "");
}

function internalSecret(): string {
  const s = process.env.ATRIUM_INTERNAL_SECRET?.trim();
  if (s === undefined || s.length === 0) {
    throw new Error("ATRIUM_INTERNAL_SECRET is not configured");
  }
  return s;
}

function sesFromAddress(): string {
  const addr = process.env.SES_FROM_ADDRESS?.trim();
  if (addr === undefined || addr.length === 0) {
    throw new Error("SES_FROM_ADDRESS is not configured");
  }
  return addr;
}

async function storeEmail(email: string): Promise<{ inserted: boolean }> {
  "use step";
  const inserted = await setEmailIfAbsent(email);
  return { inserted };
}

async function mintInviteToken(): Promise<string> {
  "use step";
  const res = await fetch(`${atriumBaseUrl()}/internal/mint-invite`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${internalSecret()}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`mint invite failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as { token?: string };
  if (data.token === undefined || data.token.length === 0) {
    throw new Error("mint invite returned no token");
  }
  return data.token;
}

async function updateToken(email: string, token: string): Promise<void> {
  "use step";
  await setTokenForEmail(email, token);
}

async function sendInviteEmail(email: string, token: string): Promise<void> {
  "use step";
  const region = process.env.AWS_REGION?.trim() ?? "us-east-1";
  const ses = new SESClient({ region });
  await ses.send(
    new SendEmailCommand({
      Source: sesFromAddress(),
      Destination: { ToAddresses: [email] },
      Message: {
        Subject: { Data: "Your Atrium invite token" },
        Body: {
          Text: {
            Data: [
              "Thanks for your interest in Khora Labs.",
              "",
              "Your invite token:",
              token,
              "",
              "Use it when registering for Atrium.",
            ].join("\n"),
          },
        },
      },
    }),
  );
  await markEmailSent(email);
}

export async function inviteWorkflow(email: string): Promise<void> {
  "use workflow";
  const normalized = email.trim().toLowerCase();
  const { inserted } = await storeEmail(normalized);
  if (!inserted) {
    return;
  }
  const token = await mintInviteToken();
  await updateToken(normalized, token);
  await sendInviteEmail(normalized, token);
}
