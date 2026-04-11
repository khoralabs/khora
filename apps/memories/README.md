# Memories graph (React + R3F)

Dev server serves the UI and **`GET /api/graph`**, which reads a SQLite memories database and returns **UMAP 3D** node positions (min–max normalized to `[-1, 1]` per axis) plus structural **edges**.

## Setup

```bash
bun install
```

## Environment

| Variable | Meaning |
|----------|---------|
| **`MEMORIES_DB_PATH`** | **Required.** Absolute or relative path to the memories SQLite file (same format as the CLI store, e.g. `apps/cli/.cfd/memories.sqlite` or your chosen path). |

Optional: open `http://localhost:3000/?namespace=cli` (port from Bun) to set the default namespace query; the UI also has a namespace field.

## Run

```bash
MEMORIES_DB_PATH=../cli/.cfd/memories.sqlite bun dev
```

Adjust the path to your on-disk DB. Then open the printed URL (e.g. `http://localhost:3000/`).

## Production

```bash
bun start
```

Ensure `MEMORIES_DB_PATH` is set in the environment for the server process.

## API

- **`GET /api/graph?namespace=<ns>`** — JSON: `{ namespace, nodes: [{ key, x, y, z }], edges: [{ fromKey, toKey }] }`. Coordinates are in **`[-1, 1]`** on each axis after normalization.

Implementation lives in `@cfd/memories-core` (`buildNamespaceGraphLayout`, graph SQL, UMAP).
