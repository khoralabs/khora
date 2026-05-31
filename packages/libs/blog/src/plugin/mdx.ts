import path from "node:path";
import { compile } from "@mdx-js/mdx";
import matter from "gray-matter";
import remarkGfm from "remark-gfm";
import { parseFrontmatter } from "../posts";

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Compile `.md` / `.mdx` as JSX for React (GFM + optional YAML frontmatter). */
export default {
  name: "mdx",
  setup(build) {
    build.onLoad({ filter: /\.(mdx|md)$/, namespace: "file" }, async (args) => {
      const file = Bun.file(args.path);
      const raw = await file.text();
      const stat = await file.stat();
      const { data, content } = matter(raw);
      const basename = path.basename(args.path, path.extname(args.path));
      const frontmatter = parseFrontmatter(basename, data as Record<string, unknown>);

      const metadata = {
        size: formatSize(stat.size),
        lastModified: new Date(stat.mtime).toLocaleDateString(),
        path: file.name ?? args.path,
      };

      const compiled = await compile(content.trim(), {
        jsxImportSource: "react",
        remarkPlugins: [remarkGfm],
      });

      const contents = `
${compiled.value}

export const frontmatter = ${JSON.stringify(frontmatter)};
export const metadata = ${JSON.stringify(metadata)};
export const raw = ${JSON.stringify(raw)};
`;

      return {
        contents,
        loader: "jsx",
      };
    });
  },
} satisfies Bun.BunPlugin;
