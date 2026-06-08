import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { applyTestEncryptionEnv } from "@khoralabs/colonnade-crypto";
import {
  ensureRegistrySchema,
  getRegistryAuth,
  getRegistryDatabase,
  reloadRegistryAuth,
  resetRegistryDatabase,
} from "@khoralabs/registry-auth";
import { seedDefaultHost } from "@khoralabs/registry-catalog";
import {
  handleAgentAuthClaimComplete,
  handleAgentAuthRegister,
  handleOAuthAuthorizationServerMetadata,
  handleOAuthProtectedResourceMetadata,
} from "./api/agent-auth";

function parseOtpFromLogs(logs: string[], email: string): string {
  const line = logs.find((l) => l.includes(`OTP for ${email}:`));
  if (line === undefined) throw new Error("OTP log line not found");
  const match = line.match(/OTP for [^:]+: (\d{6})/);
  if (match?.[1] === undefined) throw new Error("OTP not parsed");
  return match[1];
}

describe("registry agent auth", () => {
  const prevOtpLog = process.env.REGISTRY_AUTH_OTP_LOG;
  let logLines: string[] = [];
  const origLog = console.log;

  beforeEach(async () => {
    resetRegistryDatabase();
    reloadRegistryAuth();
    process.env.REGISTRY_DATABASE_PATH = ":memory:";
    process.env.BETTER_AUTH_SECRET = "test-secret-with-at-least-32-characters-long";
    process.env.REGISTRY_AUTH_OTP_LOG = "1";
    applyTestEncryptionEnv();
    await ensureRegistrySchema();
    reloadRegistryAuth();
    getRegistryAuth();
    const db = getRegistryDatabase();
    seedDefaultHost(db, { slug: "khora-local", baseUrl: "http://localhost:8788" });
    logLines = [];
    console.log = (...args: unknown[]) => {
      logLines.push(args.map(String).join(" "));
      origLog(...args);
    };
  });

  afterEach(() => {
    console.log = origLog;
    delete process.env.REGISTRY_DATABASE_PATH;
    delete process.env.BETTER_AUTH_SECRET;
    if (prevOtpLog === undefined) delete process.env.REGISTRY_AUTH_OTP_LOG;
    else process.env.REGISTRY_AUTH_OTP_LOG = prevOtpLog;
    resetRegistryDatabase();
    reloadRegistryAuth();
  });

  test("PRM and AS metadata expose agent_auth register and claim URIs", async () => {
    const prm = handleOAuthProtectedResourceMetadata();
    expect(prm.status).toBe(200);
    const prmJson = (await prm.json()) as {
      authorization_servers: string[];
      scopes_supported: string[];
    };
    expect(prmJson.authorization_servers[0]).toContain("localhost");
    expect(prmJson.scopes_supported).toContain("registry.session");

    const asRes = handleOAuthAuthorizationServerMetadata();
    const asJson = (await asRes.json()) as {
      agent_auth: { register_uri: string; claim_complete_uri: string };
    };
    expect(asJson.agent_auth.register_uri).toContain("/agent/auth");
    expect(asJson.agent_auth.claim_complete_uri).toContain("/agent/auth/claim/complete");
  });

  test("email-required register then complete returns session cookie", async () => {
    const email = "agent-auth@test.com";
    const registerRes = await handleAgentAuthRegister(
      new Request("http://localhost/agent/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "identity_assertion",
          assertion_type: "verified_email",
          email,
        }),
      }),
    );
    expect(registerRes.status).toBe(200);
    const registerJson = (await registerRes.json()) as {
      registration_id: string;
      claim_token: string;
      status: string;
    };
    expect(registerJson.status).toBe("pending_claim");
    expect(registerJson.claim_token.startsWith("clm_")).toBe(true);

    const otp = parseOtpFromLogs(logLines, email);

    const completeRes = await handleAgentAuthClaimComplete(
      new Request("http://localhost/agent/auth/claim/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claim_token: registerJson.claim_token,
          otp,
        }),
      }),
    );
    expect(completeRes.status).toBe(200);
    const completeJson = (await completeRes.json()) as {
      status: string;
      credential: { type: string; session_cookie: string };
    };
    expect(completeJson.status).toBe("claimed");
    expect(completeJson.credential.type).toBe("session");
    expect(completeJson.credential.session_cookie).toContain("better-auth.session_token=");
  });

  test("complete accepts email instead of claim_token", async () => {
    const email = "agent-auth-email@test.com";
    await handleAgentAuthRegister(
      new Request("http://localhost/agent/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "identity_assertion",
          assertion_type: "verified_email",
          email,
        }),
      }),
    );
    const otp = parseOtpFromLogs(logLines, email);

    const completeRes = await handleAgentAuthClaimComplete(
      new Request("http://localhost/agent/auth/claim/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      }),
    );
    expect(completeRes.status).toBe(200);
  });
});
