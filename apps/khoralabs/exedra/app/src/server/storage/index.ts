export {
  DEFAULT_STORAGE_ROOT_PREFIX,
  getStorageRootPrefix,
  getStorageS3Bucket,
  getStorageS3Endpoint,
  getStorageS3Region,
  isStorageConfigured,
} from "./config.js";
export {
  buildDocumentFileObjectKey,
  type DocumentStorageOwner,
  resolveDocumentStorageOwner,
} from "./owners.js";
export {
  type DatabaseSidecarSuffix,
  databaseObjectKey,
  type FileCategory,
  fileObjectKey,
  localDatabaseDir,
  localDatabasePath,
  type PrincipalKind,
  type PrincipalResource,
  principalResourcePrefix,
  principalStoragePrefix,
  validatePrincipalDid,
} from "./paths.js";
export { deleteObject, getObject, putObject, resetStorageS3ClientForTests } from "./s3.js";
