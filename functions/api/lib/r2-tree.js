import { assertCompleteListing } from './common.js';
import { deleteFileIndexKey, upsertFileIndex } from './file-index.js';
import { resolveExistingStorageId, resolveStorageIdForPath, storageDelete, storageGet, storageList, storagePut } from './storage.js';

export async function mapWithConcurrency(items, limit, worker) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      await worker(item);
    }
  });
  await Promise.all(workers);
}

export async function copyR2Object(env, sourceKey, targetKey, targetStorageId = '') {
  const sourceStorageId = await resolveExistingStorageId(env, sourceKey);
  const destStorageId = targetStorageId || sourceStorageId;
  const obj = await storageGet(env, sourceStorageId, sourceKey);
  if (!obj) return false;
  await storagePut(env, destStorageId, targetKey, obj.body, { httpMetadata: obj.httpMetadata });
  await upsertFileIndex(env, targetKey, { ...obj, storageId: destStorageId });
  return true;
}

export async function copyTree(env, sourceKey, targetKey, move = false) {
  const sourceStorageId = await resolveExistingStorageId(env, sourceKey);
  const targetStorageId = await resolveStorageIdForPath(env, targetKey);
  const obj = await storageGet(env, sourceStorageId, sourceKey);
  const listed = await storageList(env, sourceStorageId, { prefix: sourceKey + '/' });
  assertCompleteListing(listed, `Path ${sourceKey}`);

  if (obj) {
    await storagePut(env, targetStorageId, targetKey, obj.body, { httpMetadata: obj.httpMetadata });
    await upsertFileIndex(env, targetKey, { ...obj, storageId: targetStorageId });
    if (move) {
      await storageDelete(env, sourceStorageId, sourceKey);
      await deleteFileIndexKey(env, sourceKey);
    }
  }

  await mapWithConcurrency(listed.objects, 6, async item => {
    const nextKey = targetKey + item.key.slice(sourceKey.length);
    const subObj = await storageGet(env, sourceStorageId, item.key);
    if (subObj) {
      await storagePut(env, targetStorageId, nextKey, subObj.body, { httpMetadata: subObj.httpMetadata });
      await upsertFileIndex(env, nextKey, { ...subObj, storageId: targetStorageId });
      if (move) {
        await storageDelete(env, sourceStorageId, item.key);
        await deleteFileIndexKey(env, item.key);
      }
    }
  });
}
