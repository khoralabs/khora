import path from "node:path";

/** Files on disk: `public/downloads/{path}` → `/downloads/{path}` */
export const DOWNLOADS_URL_PREFIX = "/downloads";
export const DOWNLOADS_DIR = path.join(import.meta.dir, "..", "..", "public", "downloads");

const ALLOWED_EXT = /\.(json|md|txt)$/i;

const MIME_BY_EXT: Record<string, string> = {
  ".json": "application/json",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

/** Resolve a safe path under {@link DOWNLOADS_DIR} from a request pathname. */
export function resolveDownloadPath(pathname: string): string | null {
  if (!pathname.startsWith(`${DOWNLOADS_URL_PREFIX}/`)) return null;
  const rel = pathname.slice(DOWNLOADS_URL_PREFIX.length + 1);
  if (!rel || rel.includes("..")) return null;

  const abs = path.resolve(DOWNLOADS_DIR, rel);
  if (!abs.startsWith(DOWNLOADS_DIR)) return null;
  if (!ALLOWED_EXT.test(abs)) return null;

  return abs;
}

export async function serveDownloads(req: Request): Promise<Response> {
  const filePath = resolveDownloadPath(new URL(req.url).pathname);
  if (!filePath) return new Response("Not Found", { status: 404 });

  const file = Bun.file(filePath);
  if (!(await file.exists())) return new Response("Not Found", { status: 404 });

  const ext = path.extname(filePath).toLowerCase();
  const headers = new Headers();
  const contentType = MIME_BY_EXT[ext];
  if (contentType) headers.set("Content-Type", contentType);
  if (ext === ".md") {
    headers.set("Content-Disposition", `attachment; filename="${path.basename(filePath)}"`);
  }

  return new Response(file, { headers });
}
