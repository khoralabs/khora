import { join } from "node:path";
import { Glob } from "bun";

const distDir = join(import.meta.dir, "../dist/admin-ui");
const patterns = [/bun:sqlite/, /getUsersDatabase/];

const files = [...new Glob("**/*.js").scanSync(distDir)];
if (files.length === 0) {
  console.error(`check-admin-ui-bundle: no JS files under ${distDir}`);
  process.exit(1);
}

for (const rel of files) {
  const path = join(distDir, rel);
  const text = await Bun.file(path).text();
  for (const pattern of patterns) {
    if (pattern.test(text)) {
      console.error(`check-admin-ui-bundle: ${rel} matches ${pattern}`);
      process.exit(1);
    }
  }
}

console.log(`check-admin-ui-bundle: ok (${files.length} file(s))`);
