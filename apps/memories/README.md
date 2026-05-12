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

Optional: open `http://localhost:3000/?namespace=cli` (port from Bun) to set the default namespace query; the UI has a namespace combobox (with known namespaces from the database and free text via Enter or “Use …”).

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

- **`GET /api/namespaces`** — JSON: `{ namespaces: string[] }`, distinct `memories.namespace` values in the open database (sorted). Used to populate the namespace combobox; you can still type a namespace that is not listed (empty graph).
- **`GET /api/graph?namespace=<ns>`** — JSON: `{ namespace, nodes: [{ key, x, y, z }], edges: [{ fromKey, toKey }] }`. Coordinates are in **`[-1, 1]`** on each axis after normalization.

Graph layout and SQLite previews are implemented in `@khoralabs/memories-sqlite` (`buildNamespaceGraphLayout`, UMAP and layout types in the same package, SQL in the sqlite strategy).
