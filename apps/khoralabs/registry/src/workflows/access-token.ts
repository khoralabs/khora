import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import {
  createAccessTokenRequest,
  findActiveHostBySlug,
  getAccessTokenRequestById,
  hashInviteToken,
  markAccessTokenMinted,
  markAccessTokenSent,
} from "@khoralabs/users";
import { getRegistryDatabase } from "@khoralabs/users-auth";

function internalSecret(): string {
  const s = process.env.KHORA_INTERNAL_SECRET?.trim();
  if (s === undefined || s.length === 0) {
    throw new Error("KHORA_INTERNAL_SECRET is not configured");
  }
  return s;
}

function invitePepper(): string {
  const p = process.env.KHORA_INVITE_PEPPER?.trim();
  if (p === undefined || p.length === 0) {
    throw new Error("KHORA_INVITE_PEPPER is not configured");
  }
  return p;
}

function sesFromAddress(): string {
  const addr = process.env.SES_FROM_ADDRESS?.trim();
  if (addr === undefined || addr.length === 0) {
    throw new Error("SES_FROM_ADDRESS is not configured");
  }
  return addr;
}

async function mintInviteToken(baseUrl: string): Promise<string> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/internal/mint-invite`, {
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

async function sendInviteEmail(email: string, token: string): Promise<void> {
  const region = process.env.AWS_REGION?.trim() ?? "us-east-1";
  const ses = new SESClient({ region });
  await ses.send(
    new SendEmailCommand({
      Source: sesFromAddress(),
      Destination: { ToAddresses: [email] },
      Message: {
        Subject: { Data: "Your Khora invite token" },
        Body: {
          Text: {
            Data: [
              "Thanks for your interest in Khora Labs.",
              "",
              "Your invite token:",
              token,
              "",
              "Use it when registering for Khora.",
            ].join("\n"),
          },
        },
      },
    }),
  );
}

export async function runAccessTokenWorkflow(params: {
  requestId: string;
  hostSlug: string;
}): Promise<void> {
  const db = getRegistryDatabase();
  const request = getAccessTokenRequestById(db, params.requestId);
  if (request === null) return;

  const host = findActiveHostBySlug(db, params.hostSlug);
  if (host === null) {
    throw new Error(`host not found: ${params.hostSlug}`);
  }

  const token = await mintInviteToken(host.baseUrl);
  const tokenHash = hashInviteToken(invitePepper(), token);
  markAccessTokenMinted(db, request.id, tokenHash);
  await sendInviteEmail(request.email, token);
  markAccessTokenSent(db, request.id);
}

export function queueAccessTokenWorkflow(params: {
  email: string;
  hostSlug?: string;
  sourceApp?: string;
}): { inserted: boolean } | null {
  const slug = params.hostSlug?.trim();
  if (slug === undefined || slug.length === 0) {
    console.warn("[registry] access-token request skipped: hostSlug is required");
    return null;
  }

  const db = getRegistryDatabase();
  const host = findActiveHostBySlug(db, slug);
  if (host === null) {
    throw new Error(`active host not found: ${slug}`);
  }

  const { inserted, request } = createAccessTokenRequest(db, {
    email: params.email,
    hostId: host.id,
    sourceApp: params.sourceApp,
  });

  if (inserted) {
    void runAccessTokenWorkflow({ requestId: request.id, hostSlug: slug }).catch((err: unknown) => {
      console.error("[registry] access-token workflow failed:", err);
    });
  }

  return { inserted };
}
