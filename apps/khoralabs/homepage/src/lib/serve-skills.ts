import path from "node:path";
import { resolvePublicTextPath, servePublicTextFile } from "./public-text-files";

/** Agent-readable skill files: `public/downloads/skills/{path}` → `/skills/{path}` */
export const SKILLS_URL_PREFIX = "/skills";
export const SKILLS_DIR = path.join(import.meta.dir, "..", "..", "public", "downloads", "skills");

export function resolveSkillPath(pathname: string): string | null {
  return resolvePublicTextPath(pathname, SKILLS_URL_PREFIX, SKILLS_DIR);
}

export async function serveSkills(req: Request): Promise<Response> {
  const filePath = resolveSkillPath(new URL(req.url).pathname);
  if (!filePath) return new Response("Not Found", { status: 404 });
  return servePublicTextFile(filePath);
}
