import { requireAdmin } from "@khoralabs/atrium-console-auth";

export async function withAdmin(
  req: Request,
  handler: () => Promise<Response>,
): Promise<Response> {
  const denied = await requireAdmin(req);
  if (denied !== null) return denied;
  return handler();
}
