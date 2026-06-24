/**
 * Start Exedra app, authz service, and all workflow task servers for local development.
 *
 * Usage (from repo root):
 *   bun run --filter @khoralabs/exedra-stack dev
 *
 * Or from apps/khoralabs/exedra:
 *   bun run dev
 */
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const exedraRoot = path.resolve(path.dirname(import.meta.path), "..");
const appRoot = path.join(exedraRoot, "app");
const authzRoot = path.join(exedraRoot, "authz");
const chatRoot = path.join(exedraRoot, "chat");
const workflowsRoot = path.join(exedraRoot, "workflows");
const dataDir = path.join(appRoot, "data");

const DEV_AUTHZ_TOKEN = "dev-authz-token";
const DEV_INTERNAL_TOKEN = "dev-internal-token";

const ports = {
  app: 3000,
  authz: 3001,
  chat: 3002,
  generateResponse: 8120,
  integrateMemory: 8121,
  processDocument: 8122,
};

type Service = {
  name: string;
  cwd: string;
  command: string[];
  env?: Record<string, string>;
};

function parseEnvFile(contents: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function loadEnvFile(filePath: string): Record<string, string> {
  try {
    return parseEnvFile(readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
}

function prefixStream(stream: ReadableStream<Uint8Array>, name: string): void {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  void (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        if (buffer.length > 0) {
          process.stdout.write(`[${name}] ${buffer}\n`);
        }
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.length > 0) {
          process.stdout.write(`[${name}] ${line}\n`);
        }
      }
    }
  })();
}

function spawnService(service: Service): Bun.Subprocess {
  const proc = Bun.spawn(service.command, {
    cwd: service.cwd,
    env: { ...process.env, ...service.env },
    stdout: "pipe",
    stderr: "pipe",
  });
  if (proc.stdout !== undefined) prefixStream(proc.stdout, service.name);
  if (proc.stderr !== undefined) prefixStream(proc.stderr, service.name);
  return proc;
}

mkdirSync(dataDir, { recursive: true });

function pickEnv(...values: (string | undefined)[]): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed !== undefined && trimmed.length > 0) {
      return trimmed;
    }
  }
  return undefined;
}

const appEnv = loadEnvFile(path.join(appRoot, ".env"));
const authzEnv = loadEnvFile(path.join(authzRoot, ".env"));
const chatEnv = loadEnvFile(path.join(chatRoot, ".env"));
const workflowEnvFiles = [
  path.join(workflowsRoot, "generate-response", ".env"),
  path.join(workflowsRoot, "integrate-memory", ".env"),
  path.join(workflowsRoot, "process-document", ".env"),
];

const resolvedInternalToken =
  pickEnv(
    process.env.EXEDRA_INTERNAL_TOKEN,
    appEnv.EXEDRA_INTERNAL_TOKEN,
    ...workflowEnvFiles.map((filePath) => loadEnvFile(filePath).EXEDRA_INTERNAL_TOKEN),
  ) ?? DEV_INTERNAL_TOKEN;

const resolvedAuthzToken =
  pickEnv(
    process.env.AUTHZ_INTERNAL_TOKEN,
    appEnv.AUTHZ_INTERNAL_TOKEN,
    authzEnv.AUTHZ_INTERNAL_TOKEN,
  ) ?? DEV_AUTHZ_TOKEN;

const sharedEnv = {
  ...appEnv,
  ...authzEnv,
  ...chatEnv,
  EXEDRA_INTERNAL_TOKEN: resolvedInternalToken,
  AUTHZ_INTERNAL_TOKEN: resolvedAuthzToken,
  AUTHZ_SERVICE_URL: `http://localhost:${ports.authz}`,
  EXEDRA_CHAT_SERVICE_URL: `http://localhost:${ports.chat}`,
  AUTHZ_SQLITE_PATH: path.join(dataDir, "authz.db"),
  EXEDRA_CHAT_DB_PATH: path.join(dataDir, "exedra-chat.db"),
  PORT: String(ports.app),
  RENDER_USE_LOCAL_DEV: "true",
  RENDER_LOCAL_DEV_URL: `http://localhost:${ports.generateResponse}`,
  RENDER_INTEGRATION_LOCAL_DEV_URL: `http://localhost:${ports.integrateMemory}`,
  RENDER_DOCUMENT_LOCAL_DEV_URL: `http://localhost:${ports.processDocument}`,
  RENDER_GENERATE_RESPONSE_WORKFLOW_SLUG: "generate-response",
  RENDER_INTEGRATION_WORKFLOW_SLUG: "integrate-memory",
  RENDER_DOCUMENT_WORKFLOW_SLUG: "process-document",
};

const workflowSharedEnv = {
  EXEDRA_INTERNAL_URL: `http://localhost:${ports.app}`,
  EXEDRA_INTERNAL_TOKEN: sharedEnv.EXEDRA_INTERNAL_TOKEN,
  AUTHZ_SERVICE_URL: sharedEnv.AUTHZ_SERVICE_URL,
  AUTHZ_INTERNAL_TOKEN: sharedEnv.AUTHZ_INTERNAL_TOKEN,
};

const services: Service[] = [
  {
    name: "authz",
    cwd: authzRoot,
    command: ["bun", "run", "start"],
    env: {
      ...sharedEnv,
      PORT: String(ports.authz),
    },
  },
  {
    name: "chat",
    cwd: chatRoot,
    command: ["bun", "run", "start"],
    env: {
      ...sharedEnv,
      PORT: String(ports.chat),
    },
  },
  {
    name: "generate-response",
    cwd: path.join(workflowsRoot, "generate-response"),
    command: [
      "render",
      "workflows",
      "dev",
      "--port",
      String(ports.generateResponse),
      "--",
      "bun",
      "src/main.ts",
    ],
    env: {
      ...sharedEnv,
      ...loadEnvFile(path.join(workflowsRoot, "generate-response", ".env")),
      ...workflowSharedEnv,
    },
  },
  {
    name: "integrate-memory",
    cwd: path.join(workflowsRoot, "integrate-memory"),
    command: [
      "render",
      "workflows",
      "dev",
      "--port",
      String(ports.integrateMemory),
      "--",
      "bun",
      "src/main.ts",
    ],
    env: {
      ...sharedEnv,
      ...loadEnvFile(path.join(workflowsRoot, "integrate-memory", ".env")),
      ...workflowSharedEnv,
    },
  },
  {
    name: "process-document",
    cwd: path.join(workflowsRoot, "process-document"),
    command: [
      "render",
      "workflows",
      "dev",
      "--port",
      String(ports.processDocument),
      "--",
      "bun",
      "src/main.ts",
    ],
    env: {
      ...sharedEnv,
      ...loadEnvFile(path.join(workflowsRoot, "process-document", ".env")),
      ...workflowSharedEnv,
    },
  },
  {
    name: "app",
    cwd: appRoot,
    command: ["bun", "run", "dev"],
    env: sharedEnv,
  },
];

console.log("Starting Exedra local stack:");
for (const service of services) {
  console.log(`  - ${service.name}`);
}
console.log("");
console.log(`  App:               http://localhost:${ports.app}`);
console.log(`  Authz:             http://localhost:${ports.authz}`);
console.log(`  Chat:              http://localhost:${ports.chat}`);
console.log(`  generate-response: http://localhost:${ports.generateResponse}`);
console.log(`  integrate-memory:  http://localhost:${ports.integrateMemory}`);
console.log(`  process-document:  http://localhost:${ports.processDocument}`);
console.log("");
console.log("  Internal tokens (app + workflows must match):");
console.log(`    EXEDRA_INTERNAL_TOKEN: ${resolvedInternalToken}`);
console.log(`    AUTHZ_INTERNAL_TOKEN:  ${resolvedAuthzToken}`);
console.log("");

const children = services.map(spawnService);

function shutdown(): void {
  for (const child of children) {
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    shutdown();
    process.exit(0);
  });
}

await Promise.race(children.map((child) => child.exited));
shutdown();
process.exit(1);
