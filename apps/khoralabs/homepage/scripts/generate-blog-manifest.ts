import path from "node:path";
import { generateManifest } from "@khoralabs/blog/node";

const appRoot = path.join(import.meta.dir, "..");

await generateManifest({
  postsDir: path.join(appRoot, "content/posts"),
  outFile: path.join(appRoot, "src/generated/blog-manifest.ts"),
});

console.log("Generated blog manifest");
