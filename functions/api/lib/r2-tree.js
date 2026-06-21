import { assertCompleteListing } from "./common.js";
import {
  countFileIndexObjectRefs,
  deleteFileIndexKey,
  listFileIndexPrefix,
  updateFileIndexObjectKey,
  upsertFileIndex,
} from "./file-index.js";
import {
  resolveExistingObjectLocation,
  resolveExistingStorageId,
  resolveStorageIdForPath,
  storageCopy,
  storageDelete,
  storageGet,
  storageList,
  storagePut,
} from "./storage.js";

export async function mapWithConcurrency(items, limit, worker) {
  const queue = [...items];
  const workers = Array.from(
    { length: Math.min(limit, queue.length) },
    async () => {
      while (queue.length) {
        const item = queue.shift();
        await worker(item);
      }
    },
  );
  await Promise.all(workers);
}

export async function copyR2Object(
  env,
  sourceKey,
  targetKey,
  targetStorageId = "",
) {
  const sourceLocation = await resolveExistingObjectLocation(env, sourceKey);
  const sourceStorageId = sourceLocation.storageId;
  const sourceObjectKey = sourceLocation.objectKey;
  const destStorageId = targetStorageId || sourceStorageId;
  const obj = await storageGet(env, sourceStorageId, sourceObjectKey);
  if (!obj) return false;
  await storagePut(env, destStorageId, targetKey, obj.body, {
    httpMetadata: obj.httpMetadata,
  });
  await upsertFileIndex(env, targetKey, {
    ...obj,
    storageId: destStorageId,
    objectKey: targetKey,
  });
  return true;
}

export async function deletePathEntry(env, path, storageId, objectKey) {
  const realObjectKey = objectKey || path;
  await deleteFileIndexKey(env, path);
  const refs = await countFileIndexObjectRefs(env, storageId, realObjectKey);
  if (refs <= 0) {
    await storageDelete(env, storageId, realObjectKey);
    return;
  }
  if (realObjectKey !== path) return;
  const obj = await storageGet(env, storageId, realObjectKey);
  if (!obj) return;
  const hiddenKey = `.system/file-objects/${storageId || "r2"}/${crypto.randomUUID()}`;
  await storagePut(env, storageId, hiddenKey, obj.body, {
    httpMetadata: obj.httpMetadata,
  });
  await updateFileIndexObjectKey(env, storageId, realObjectKey, hiddenKey);
  await storageDelete(env, storageId, realObjectKey);
}

async function ensureSourceIndexed(env, path, location, obj) {
  if (location.indexed) return;
  await upsertFileIndex(env, path, {
    ...obj,
    storageId: location.storageId,
    objectKey: location.objectKey,
  });
}

export async function copyTree(env, sourceKey, targetKey, move = false) {
  const sourceLocation = await resolveExistingObjectLocation(env, sourceKey);
  const sourceStorageId = sourceLocation.storageId;
  const targetStorageId = await resolveStorageIdForPath(env, targetKey);
  const sourceObjectKey = sourceLocation.objectKey;
  const obj = await storageGet(env, sourceStorageId, sourceObjectKey);
  const listed = await storageList(env, sourceStorageId, {
    prefix: sourceKey + "/",
  });
  assertCompleteListing(listed, `Path ${sourceKey}`);
  const subtreeEntries = new Map();

  if (obj) {
    if (!move && sourceStorageId === targetStorageId) {
      await ensureSourceIndexed(env, sourceKey, sourceLocation, obj);
      await upsertFileIndex(env, targetKey, {
        ...obj,
        storageId: sourceStorageId,
        objectKey: sourceObjectKey,
      });
    } else {
      await storagePut(env, targetStorageId, targetKey, obj.body, {
        httpMetadata: obj.httpMetadata,
      });
      await upsertFileIndex(env, targetKey, {
        ...obj,
        storageId: targetStorageId,
        objectKey: targetKey,
      });
    }
    if (move) {
      await deletePathEntry(env, sourceKey, sourceStorageId, sourceObjectKey);
    }
  }

  for (const row of await listFileIndexPrefix(env, sourceKey)) {
    if (row.path !== sourceKey) subtreeEntries.set(row.path, row);
  }
  for (const item of listed.objects || []) {
    if (item.key !== sourceKey) subtreeEntries.set(item.key, item);
  }

  await mapWithConcurrency([...subtreeEntries.values()], 6, async (item) => {
    const logicalKey = item.path || item.key;
    const nextKey = targetKey + logicalKey.slice(sourceKey.length);
    const subLocation = await resolveExistingObjectLocation(env, logicalKey);
    const subObj = await storageGet(
      env,
      subLocation.storageId,
      subLocation.objectKey,
    );
    if (subObj) {
      if (!move && subLocation.storageId === targetStorageId) {
        await ensureSourceIndexed(env, logicalKey, subLocation, subObj);
        await upsertFileIndex(env, nextKey, {
          ...subObj,
          storageId: subLocation.storageId,
          objectKey: subLocation.objectKey,
        });
      } else {
        await storagePut(env, targetStorageId, nextKey, subObj.body, {
          httpMetadata: subObj.httpMetadata,
        });
        await upsertFileIndex(env, nextKey, {
          ...subObj,
          storageId: targetStorageId,
          objectKey: nextKey,
        });
      }
      if (move) {
        await deletePathEntry(
          env,
          logicalKey,
          subLocation.storageId,
          subLocation.objectKey,
        );
      }
    }
  });
}
