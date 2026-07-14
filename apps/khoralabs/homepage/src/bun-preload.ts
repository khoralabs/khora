import mdxPlugin from "@khoralabs/blog/plugin";
import { ensureBlogManifest } from "./lib/ensure-blog-manifest";

Bun.plugin(mdxPlugin);
await ensureBlogManifest();
