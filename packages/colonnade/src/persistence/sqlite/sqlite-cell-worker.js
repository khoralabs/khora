/**
 * Stable Bun Worker entry for source and published builds.
 * Source mode: Bun resolves the TypeScript implementation below.
 * Release builds: this file (or its .ts twin) is bundled to dist/sqlite-cell-worker.js.
 */
import "./sqlite-cell-worker.ts";
