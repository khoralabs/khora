import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { applyTestEncryptionEnv } from "@khoralabs/colonnade/crypto";
import { seedDefaultHost } from "@khoralabs/registry/catalog";
import type { AgentAuthRouteDeps, RegistryAuthHttpPort } from "@khoralabs/registry/host";
import {
  handleAgentAuthClaimComplete,
  handleAgentAuthRegister,
  handleOAuthAuthorizationServerMetadata,
  handleOAuthProtectedResourceMetadata,
} from "@khoralabs/registry/host";
import {
  type createRegistrySqliteDatabase,
  getRegistrySqliteBundle,
  resetRegistrySqliteDatabase,
} from "@khoralabs/registry/sqlite";
import { setCaptureOtpForTests } from "./email/ses";
import { getRegistryAuth, reloadRegistryAuth } from "./instance";
import { createBetterAuthHttpPort } from "./ports/http";
import { initRegistryAppSchema } from "./schema";

function agentAuthDeps(
  db: ReturnType<typeof createRegistrySqliteDatabase>,
  authHttp: RegistryAuthHttpPort,
): AgentAuthRouteDeps {
  return {
    db,
    publicUrl: () => "http://localhost:4000",
    authMdUrl: "https://khoralabs.com/auth.md",
    resourceName: "Khora Registry",
    authHttp,
  };
}

describe("registry agent auth", () => {
  const prevOtpLog = process.env.REGISTRY_AUTH_OTP_LOG;
  const capturedOtps = new Map<string, string>();
  let deps: AgentAuthRouteDeps;

  beforeEach(async () => {
    resetRegistrySqliteDatabase();
    reloadRegistryAuth();
    process.env.REGISTRY_DATABASE_PATH = ":memory:";
    process.env.BETTER_AUTH_SECRET = "test-secret-with-at-least-32-characters-long";
    process.env.REGISTRY_AUTH_OTP_LOG = "1";
    applyTestEncryptionEnv();
    const { db, registry } = getRegistrySqliteBundle();
    await initRegistryAppSchema(registry, db);
    reloadRegistryAuth({ database: db, domainDatabase: registry });
    getRegistryAuth();
    const authHttp = createBetterAuthHttpPort({ publicUrl: () => "http://localhost:4000" });
    deps = agentAuthDeps(registry, authHttp);
    await seedDefaultHost(registry, { slug: "khora-local", baseUrl: "http://localhost:8788" });
    capturedOtps.clear();
    setCaptureOtpForTests(({ email, otp }) => {
      capturedOtps.set(email, otp);
    });
  });

  afterEach(() => {
    setCaptureOtpForTests(undefined);
    delete process.env.REGISTRY_DATABASE_PATH;
    delete process.env.BETTER_AUTH_SECRET;
    if (prevOtpLog === undefined) delete process.env.REGISTRY_AUTH_OTP_LOG;
    else process.env.REGISTRY_AUTH_OTP_LOG = prevOtpLog;
    resetRegistrySqliteDatabase();
    reloadRegistryAuth();
  });

  async function waitForOtp(email: string): Promise<string> {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const otp = capturedOtps.get(email);
      if (otp !== undefined) return otp;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`OTP not captured for ${email}`);
  }

  test("PRM and AS metadata expose agent_auth register and claim URIs", async () => {
    const prm = await handleOAuthProtectedResourceMetadata(deps);
    expect(prm.status).toBe(200);
    const prmJson = (await prm.json()) as {
      authorization_servers: string[];
      scopes_supported: string[];
    };
    expect(prmJson.authorization_servers[0]).toContain("localhost");
    expect(prmJson.scopes_supported).toContain("registry.session");

    const asRes = await handleOAuthAuthorizationServerMetadata(deps);
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
      deps,
    );
    expect(registerRes.status).toBe(200);
    const registerJson = (await registerRes.json()) as {
      registration_id: string;
      claim_token: string;
      status: string;
    };
    expect(registerJson.status).toBe("pending_claim");
    expect(registerJson.claim_token.startsWith("clm_")).toBe(true);

    const otp = await waitForOtp(email);

    const completeRes = await handleAgentAuthClaimComplete(
      new Request("http://localhost/agent/auth/claim/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claim_token: registerJson.claim_token,
          otp,
        }),
      }),
      deps,
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
      deps,
    );
    const otp = await waitForOtp(email);

    const completeRes = await handleAgentAuthClaimComplete(
      new Request("http://localhost/agent/auth/claim/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      }),
      deps,
    );
    expect(completeRes.status).toBe(200);
  });
});
