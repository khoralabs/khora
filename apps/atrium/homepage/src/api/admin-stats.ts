import { fetchAtriumInternal } from "./atrium-internal.ts";
import { withAdmin } from "./admin-guard.ts";

function looksLikeHtml(text: string): boolean {
  const t = text.trimStart().slice(0, 200).toLowerCase();
  return t.startsWith("<!doctype") || t.startsWith("<html");
}

async function readUpstreamError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const j = JSON.parse(text) as { error?: unknown };
    if (typeof j.error === "string" && j.error.length > 0) return j.error;
  } catch {
    /* ignore */
  }
  if (looksLikeHtml(text)) {
    const title = /<title[^>]*>([^<]+)<\/title>/i.exec(text)?.[1]?.trim();
    const statusPart = `${res.status} ${res.statusText}`.trim();
    return title !== undefined && title.length > 0 ? `${statusPart}: ${title}` : statusPart;
  }
  if (text.length > 400) {
    return `${res.status} ${res.statusText}`.trim();
  }
  return text.length > 0 ? text : res.statusText;
}

async function proxyJson(path: string): Promise<Response> {
  const upstream = await fetchAtriumInternal(path);
  const contentType = upstream.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  }
  const message = await readUpstreamError(upstream);
  return Response.json({ error: message }, { status: upstream.status || 502 });
}

export async function handleAdminStatsSummary(req: Request): Promise<Response> {
  return withAdmin(req, () => proxyJson("/internal/admin/stats/summary"));
}

export async function handleAdminStatsPrincipal(req: Request): Promise<Response> {
  return withAdmin(req, async () => {
    const url = new URL(req.url);
    const did = url.searchParams.get("did")?.trim() ?? "";
    if (did.length === 0) {
      return Response.json({ error: "Missing did query parameter" }, { status: 400 });
    }
    return proxyJson(
      `/internal/admin/stats/principal?did=${encodeURIComponent(did)}`,
    );
  });
}

export async function handleAdminStatsCell(req: Request): Promise<Response> {
  return withAdmin(req, async () => {
    const url = new URL(req.url);
    const cellId = url.searchParams.get("cellId")?.trim() ?? "";
    if (cellId.length === 0) {
      return Response.json({ error: "Missing cellId query parameter" }, { status: 400 });
    }
    return proxyJson(
      `/internal/admin/stats/cell?cellId=${encodeURIComponent(cellId)}`,
    );
  });
}
