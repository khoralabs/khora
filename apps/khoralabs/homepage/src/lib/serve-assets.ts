import path from "node:path";

/** Files on disk: `src/assets/{path}` → `/assets/{path}` */
export const ASSETS_URL_PREFIX = "/assets";
export const ASSETS_DIR = path.join(import.meta.dir, "..", "assets");

const ALLOWED_EXT = /\.(svg|png|jpg|jpeg|ico|ttf|webp)$/i;

const MIME_BY_EXT: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".webp": "image/webp",
};

/** Resolve a safe path under {@link ASSETS_DIR} from a request pathname. */
export function resolveAssetPath(pathname: string): string | null {
  if (!pathname.startsWith(`${ASSETS_URL_PREFIX}/`)) return null;
  const rel = pathname.slice(ASSETS_URL_PREFIX.length + 1);
  if (!rel || rel.includes("..")) return null;

  const abs = path.resolve(ASSETS_DIR, rel);
  if (!abs.startsWith(ASSETS_DIR)) return null;
  if (!ALLOWED_EXT.test(abs)) return null;

  return abs;
}

export async function serveAssets(req: Request): Promise<Response> {
  const filePath = resolveAssetPath(new URL(req.url).pathname);
  if (!filePath) return new Response("Not Found", { status: 404 });

  const file = Bun.file(filePath);
  if (!(await file.exists())) return new Response("Not Found", { status: 404 });

  const ext = path.extname(filePath).toLowerCase();
  const headers = new Headers();
  const contentType = MIME_BY_EXT[ext];
  if (contentType) headers.set("Content-Type", contentType);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");

  return new Response(file, { headers });
}
