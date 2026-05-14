import { compile } from "@mdx-js/mdx";
import remarkGfm from "remark-gfm";

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Compile `.md` / `.mdx` as JSX for React (GFM only — agreements stay lightweight). */
export default {
  name: "mdx",
  setup(build) {
    build.onLoad({ filter: /\.(mdx|md)$/, namespace: "file" }, async (args) => {
      const file = Bun.file(args.path);
      const raw = await file.text();
      const stat = await file.stat();

      const metadata = {
        size: formatSize(stat.size),
        lastModified: new Date(stat.mtime).toLocaleDateString(),
        path: file.name ?? args.path,
      };

      const compiled = await compile(raw, {
        jsxImportSource: "react",
        remarkPlugins: [remarkGfm],
      });

      const contents = `
${compiled.value}

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
