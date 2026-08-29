import type { Database } from "bun:sqlite";

/** WAL + sane defaults for Colonnade persistence workloads (benchmarks and servers). */
export function applySqlitePerfPragmas(db: Database): void {
  db.run(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA cache_size = -64000;
    PRAGMA mmap_size = 268435456;
    PRAGMA temp_store = MEMORY;
  `);
}
