import path from "node:path";

/** Files on disk: `public/blog/media/{post}/{file}` → `/blog/media/{post}/{file}` */
export const BLOG_MEDIA_URL_PREFIX = "/blog/media";
export const BLOG_MEDIA_DIR = path.join(import.meta.dir, "..", "..", "public", "blog", "media");

const ALLOWED_EXT = /\.(avif|gif|jpe?g|png|svg|webp)$/i;

/** Resolve a safe path under {@link BLOG_MEDIA_DIR} from a request pathname. */
export function resolveBlogMediaPath(pathname: string): string | null {
  if (!pathname.startsWith(`${BLOG_MEDIA_URL_PREFIX}/`)) return null;
  const rel = pathname.slice(BLOG_MEDIA_URL_PREFIX.length + 1);
  if (!rel || rel.includes("..")) return null;

  const abs = path.resolve(BLOG_MEDIA_DIR, rel);
  if (!abs.startsWith(BLOG_MEDIA_DIR)) return null;
  if (!ALLOWED_EXT.test(abs)) return null;

  return abs;
}

export async function serveBlogMedia(req: Request): Promise<Response> {
  const filePath = resolveBlogMediaPath(new URL(req.url).pathname);
  if (!filePath) return new Response("Not Found", { status: 404 });

  const file = Bun.file(filePath);
  if (!(await file.exists())) return new Response("Not Found", { status: 404 });

  return new Response(file);
}
