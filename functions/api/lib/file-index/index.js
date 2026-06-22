export { ensureFileIndexTable } from "./ensure.js";
export { indexedFileKind, indexedFileCount, normalizeIndexRow, mapIndexRow } from "./helpers.js";
export { buildUpsertParams, upsertFileIndex, batchUpsertFileIndex } from "./upsert.js";
export { deleteFileIndexKey, deleteFileIndexPrefix, countFileIndexObjectRefs, updateFileIndexObjectKey } from "./delete.js";
export { getFileIndexEntry, getFileIndexStorageId, listFileIndexPrefix, hasFileIndexPath, listIndexedDirectory } from "./query.js";
export { searchFileIndex } from "./search.js";
export { clearStorageUsedCache, getIndexedStorageUsed, getIndexedStats, fileIndexStatus } from "./stats.js";
export { syncFileIndexFromR2, rebuildFileIndex } from "./sync.js";
