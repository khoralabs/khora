import fs from "node:fs/promises";
import path from "node:path";

export type PostFileEntry = {
  slug: string;
  filePath: string;
  importPath: string;
};

export async function loadPostFiles(postsDir: string): Promise<PostFileEntry[]> {
  let files: string[];
  try {
    files = (await fs.readdir(postsDir)).filter((f) => /\.(md|mdx)$/i.test(f));
  } catch {
    return [];
  }

  return files.map((file) => {
    const slug = path.basename(file, path.extname(file));
    const filePath = path.join(postsDir, file);
    return {
      slug,
      filePath,
      importPath: filePath,
    };
  });
}
