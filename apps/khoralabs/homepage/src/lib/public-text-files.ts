import path from "node:path";

const ALLOWED_EXT = /\.(json|md|txt)$/i;

const MIME_BY_EXT: Record<string, string> = {
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

/** Resolve a safe path under `rootDir` from a request pathname and URL prefix. */
export function resolvePublicTextPath(
  pathname: string,
  urlPrefix: string,
  rootDir: string,
): string | null {
  if (!pathname.startsWith(`${urlPrefix}/`)) return null;
  const rel = pathname.slice(urlPrefix.length + 1);
  if (!rel || rel.includes("..")) return null;

  const abs = path.resolve(rootDir, rel);
  if (!abs.startsWith(rootDir)) return null;
  if (!ALLOWED_EXT.test(abs)) return null;

  return abs;
}

/** Serve a markdown/json/text file inline for agents and browsers. */
export async function servePublicTextFile(filePath: string): Promise<Response> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) return new Response("Not Found", { status: 404 });

  const ext = path.extname(filePath).toLowerCase();
  const headers = new Headers({
    "Cache-Control": "public, max-age=300",
  });
  const contentType = MIME_BY_EXT[ext];
  if (contentType) headers.set("Content-Type", contentType);

  return new Response(file, { headers });
}
