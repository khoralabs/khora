import path from "node:path";
import { resolvePublicTextPath, servePublicTextFile } from "./public-text-files";

/** Files on disk: `public/downloads/{path}` → `/downloads/{path}` */
export const DOWNLOADS_URL_PREFIX = "/downloads";
export const DOWNLOADS_DIR = path.join(import.meta.dir, "..", "..", "public", "downloads");

/** Resolve a safe path under {@link DOWNLOADS_DIR} from a request pathname. */
export function resolveDownloadPath(pathname: string): string | null {
  return resolvePublicTextPath(pathname, DOWNLOADS_URL_PREFIX, DOWNLOADS_DIR);
}

export async function serveDownloads(req: Request): Promise<Response> {
  const filePath = resolveDownloadPath(new URL(req.url).pathname);
  if (!filePath) return new Response("Not Found", { status: 404 });
  return servePublicTextFile(filePath);
}
