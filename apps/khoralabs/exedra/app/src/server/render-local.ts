import { Render } from "@renderinc/sdk";

export function createRenderWorkflowClient(options: { localDevUrlEnv: string }): Render | null {
  const useLocalDev = process.env.RENDER_USE_LOCAL_DEV?.trim() === "true";
  const slugEnv = options.localDevUrlEnv;
  const localDevUrl =
    process.env[slugEnv]?.trim() || process.env.RENDER_LOCAL_DEV_URL?.trim() || undefined;
  const token = process.env.RENDER_API_KEY?.trim() || "local-dev";

  if (useLocalDev) {
    if (localDevUrl === undefined) {
      return null;
    }
    return new Render({ localDevUrl, token, useLocalDev: true });
  }

  if (token === "local-dev") {
    return null;
  }

  return new Render({ token });
}
