import { existsSync } from "node:fs";
import path from "node:path";
import { generateManifest } from "@khoralabs/blog/node";

const manifestPath = path.join(import.meta.dir, "..", "generated", "blog-manifest.ts");

/** Create `src/generated/blog-manifest.ts` when missing (e.g. production deploy without prebuild). */
export async function ensureBlogManifest(): Promise<void> {
  if (existsSync(manifestPath)) return;

  const appRoot = path.join(import.meta.dir, "../..");
  console.warn(
    "[blog] Generated manifest missing; running generate:blog before serving /blog routes.",
  );

  await generateManifest({
    postsDir: path.join(appRoot, "content/posts"),
    outFile: manifestPath,
  });
}
