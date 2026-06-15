import { isExedraStubRegistryEnabled } from "../registry-stub/config";
import { handleStubSignOut } from "../registry-stub/handlers";
import { getRegistryUrl } from "../registry-url";

export async function handleSignOut(req: Request): Promise<Response> {
  if (isExedraStubRegistryEnabled()) {
    return handleStubSignOut(req);
  }

  const registryUrl = getRegistryUrl();
  const cookie = req.headers.get("cookie");
  const registryRes = await fetch(`${registryUrl}/api/auth/sign-out`, {
    method: "POST",
    headers: cookie !== null ? { cookie } : {},
  });

  return new Response(registryRes.body, {
    status: registryRes.status,
    headers: registryRes.headers,
  });
}
