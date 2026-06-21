export function requireInternalToken(req: Request): Response | null {
  const expected = process.env.EXEDRA_INTERNAL_TOKEN?.trim();
  if (expected === undefined || expected.length === 0) {
    return Response.json({ error: "Internal API not configured" }, { status: 503 });
  }

  const auth = req.headers.get("authorization")?.trim() ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  const token = match?.[1]?.trim() ?? "";
  if (token.length === 0 || token !== expected) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
