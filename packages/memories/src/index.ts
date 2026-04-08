export {
  assertRelationalSchemaExtractParity,
  assertSqliteDatabaseMatchesSchema,
  defineSchema,
  defineTable,
  documentValidator,
  extractRelationalSchema,
  type ForeignKeySpec,
  jsonOrNull,
  type RelationalSchemaManifest,
  sqliteDdlFromSchema,
  stableId,
  type TableColumnShape,
  type ZIdMeta,
  zId,
} from "./_lib";
export {
  type BinaryEmbedInput,
  createEmbeddingModel,
  EMBEDDING_MODEL_NAME,
  type EmbeddingModel,
  type EmbeddingModelOptions,
  embedBinaryBlob,
  embedTextChunks,
  GOOGLE_EMBED_BATCH_SIZE,
  MAX_TEXT_CHUNK_CHARS,
} from "./adapters/embedding-model";
export {
  buildRetrievalText,
  type FileToContentInput,
  type FileToContentResult,
  fileToContent,
  GEMINI_EMBEDDING_SUPPORTED_MIME_TYPES,
  isGeminiMultimodalEmbeddingMime,
  isTextLikeMime,
} from "./adapters/file-to-content";
export {
  splitTextContent,
  type TextToContentInput,
  type TextToContentResult,
  textToContent,
} from "./adapters/text-to-content";
export {
  MemoriesClient,
  type TypedMergeParams,
  type TypedSearchHit,
  type TypedSearchParams,
} from "./api/client";
export { type DeleteMemoryParams, deleteMemory } from "./api/delete-memory";
export {
  type MergeMemoryContentItem,
  type MergeMemoryParams,
  type MutationCtx,
  mergeMemory,
  zMergeMemoryContentItem,
} from "./api/merge-memory";
export {
  defineOntology,
  type EdgeLabelInstance,
  encodeOntologyLabel,
  type NodeLabelInstance,
  type OntologyDefinition,
  parseOntologyLabelValue,
  validateEdgeLabel,
  validateNodeLabel,
} from "./api/ontology";
export {
  type SearchContent,
  type SearchHit,
  type SearchParams,
  search,
} from "./api/search";
export {
  type Schema,
  schema,
  zMemory,
  zSourceMap,
  zTextFeature,
  zVectorFeature,
} from "./db/schema";
export {
  deleteVectorVecRowsForMemory,
  ensureVectorFeaturesVecTable,
  initTextFeaturesFts,
  TEXT_FEATURES_FTS_SQL,
  vectorVecTableName,
} from "./db/search-indexes";
export {
  blobToVector,
  ensureCustomSqliteForExtensions,
  initMemoriesSchema,
  loadSqliteVec,
  MEMORIES_SCHEMA_SQL,
  type OpenMemoriesDatabaseOptions,
  openMemoriesDatabase,
  SQLITE_CUSTOM_LIB_ENV,
  vectorToBlob,
} from "./db/sqlite";
export * from "./librarian";
export * from "./models";
