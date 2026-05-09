import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { MemoriesClient } from "@cfd/memories-core";
import type { EmbeddingModel } from "@cfd/memories-core/helpers";
import { embedTextChunks } from "@cfd/memories-core/helpers";
import { canonicalOntology } from "@cfd/memories-core/ontologies";
import { createMemoriesPersistence, openMemoriesDatabase } from "@cfd/memories-sqlite";
import { JsonlStore } from "@cfd/memories-stores";
import { jsonlStorePathForNamespace } from "./jsonl-path.ts";
import { ensureRelaySchema } from "./schema.ts";

export const RELAY_CARD_NAMESPACE = "relay/public_cards/_global_" as const;

export type AgentCard = {
  actorHex: string;
  displayName: string;
  tagline: string;
  about: string;
  relayEndpoint: string;
};

export type RelayCardStore = {
  upsertCard(card: AgentCard): Promise<void>;
  searchCards(query: string, topK: number): Promise<AgentCard[]>;
};

function ensureParentDir(path: string): void {
  if (path === ":memory:" || path.startsWith("file:")) {
    return;
  }
  const dir = dirname(path);
  if (dir && dir !== ".") {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Opens persistence in extension-safe order: memories DB first (sqlite-vec), then relay state.
 * Callers must not open another {@link Database} before this when using file-backed paths.
 */
export function createRelayCardStore(options: {
  stateDbPath: string;
  memoriesDbPath: string;
  memoriesRoot: string;
  embeddingModel?: EmbeddingModel;
}): { cardStore: RelayCardStore; stateDb: Database; memoriesDb: Database } {
  const { stateDbPath, memoriesDbPath, memoriesRoot, embeddingModel } = options;

  mkdirSync(memoriesRoot, { recursive: true });
  ensureParentDir(memoriesDbPath);
  ensureParentDir(stateDbPath);

  /** Must be the first `Database` opened in the process for sqlite-vec extension loading. */
  const memoriesDb = openMemoriesDatabase(memoriesDbPath);
  const persistence = createMemoriesPersistence(memoriesDb);

  const stateDb = new Database(stateDbPath, { create: true });
  ensureRelaySchema(stateDb);

  const client = new MemoriesClient(persistence, canonicalOntology, {
    storeForNamespace: (namespace: string) =>
      new JsonlStore(jsonlStorePathForNamespace(memoriesRoot, namespace)),
  });

  const cardText = (c: AgentCard): string =>
    `${c.displayName}\n${c.tagline}\n${c.about}\n${c.relayEndpoint}`;

  const cardStore: RelayCardStore = {
    async upsertCard(card: AgentCard): Promise<void> {
      const now = Date.now();
      stateDb.run(
        `INSERT INTO cards (actor_hex, display_name, tagline, about, relay_endpoint, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(actor_hex) DO UPDATE SET
           display_name = excluded.display_name,
           tagline = excluded.tagline,
           about = excluded.about,
           relay_endpoint = excluded.relay_endpoint,
           updated_at = excluded.updated_at`,
        [card.actorHex, card.displayName, card.tagline, card.about, card.relayEndpoint, now],
      );

      let searchMetaVector: number[] | undefined;
      if (embeddingModel !== undefined) {
        const text = cardText(card);
        const embeddings = await embedTextChunks(embeddingModel, [text]);
        searchMetaVector = embeddings[0];
      }

      client.mergeMemory({
        kind: "node",
        key: card.actorHex,
        namespace: RELAY_CARD_NAMESPACE,
        labels: [
          {
            kind: "observation",
            props: {
              summary: `Relay agent card for ${card.displayName} (${card.actorHex}).`,
            },
          },
        ],
        content: [{ key: "card", text: cardText(card) }],
        ...(searchMetaVector !== undefined ? { searchMetaVector } : {}),
        ontology: canonicalOntology,
      });
    },

    async searchCards(query: string, topK: number): Promise<AgentCard[]> {
      const q = query.trim();
      if (q.length === 0) {
        return [];
      }

      let content: { text: string } | { text: string; vector: number[] } | { vector: number[] };
      if (embeddingModel !== undefined) {
        const embeddings = await embedTextChunks(embeddingModel, [q]);
        const vector = embeddings[0];
        content = vector !== undefined && vector.length > 0 ? { text: q, vector } : { text: q };
      } else {
        content = { text: q };
      }

      const hits = client.search({
        namespace: RELAY_CARD_NAMESPACE,
        content,
        options: { topK, neighbors: false },
      });

      const out: AgentCard[] = [];
      for (const h of hits) {
        const row = stateDb
          .query(
            `SELECT actor_hex, display_name, tagline, about, relay_endpoint FROM cards WHERE actor_hex = ?`,
          )
          .get(h.memory.key) as
          | {
              actor_hex: string;
              display_name: string;
              tagline: string;
              about: string;
              relay_endpoint: string;
            }
          | undefined;
        if (row === undefined) {
          continue;
        }
        out.push({
          actorHex: row.actor_hex,
          displayName: row.display_name,
          tagline: row.tagline,
          about: row.about,
          relayEndpoint: row.relay_endpoint,
        });
      }
      return out;
    },
  };

  return { cardStore, stateDb, memoriesDb };
}
