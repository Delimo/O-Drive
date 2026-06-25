import {
  countFileIndexObjectRefs,
  deleteFileIndexKey,
  listFileIndexPrefix,
  updateFileIndexObjectKey,
  upsertFileIndex,
} from "./file-index/index.js";
import {
  resolveExistingObjectLocation,
  storageCopy,
  storageDelete,
  storageGet,
  storageHead,
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

export async function copyR2Object(env, sourceKey, targetKey) {
  const sourceLocation = await resolveExistingObjectLocation(env, sourceKey);
  const sourceObjectKey = sourceLocation.objectKey;
  await storageCopy(env, "r2", sourceObjectKey, "r2", targetKey);
  const meta = await storageHead(env, "r2", targetKey);
  await upsertFileIndex(env, targetKey, {
    size: meta?.size,
    httpMetadata: meta?.httpMetadata,
    storageId: "r2",
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
  const sourceObjectKey = sourceLocation.objectKey;
  const obj = await storageGet(env, "r2", sourceObjectKey);
  const listed = await storageList(env, "r2", {
    prefix: sourceKey + "/",
  });
  const subtreeEntries = new Map();

  if (obj) {
    if (!move) {
      await ensureSourceIndexed(env, sourceKey, sourceLocation, obj);
      await upsertFileIndex(env, targetKey, {
        ...obj,
        storageId: "r2",
        objectKey: sourceObjectKey,
      });
    } else {
      await storageCopy(env, "r2", sourceObjectKey, "r2", targetKey);
      const meta = await storageHead(env, "r2", targetKey);
      await upsertFileIndex(env, targetKey, {
        size: meta?.size,
        httpMetadata: meta?.httpMetadata,
        storageId: "r2",
        objectKey: targetKey,
      });
    }
    if (move) {
      await deletePathEntry(env, sourceKey, "r2", sourceObjectKey);
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
    const subObj = await storageGet(env, "r2", subLocation.objectKey);
    if (subObj) {
      if (!move) {
        await ensureSourceIndexed(env, logicalKey, subLocation, subObj);
        await upsertFileIndex(env, nextKey, {
          ...subObj,
          storageId: "r2",
          objectKey: subLocation.objectKey,
        });
      } else {
        await storageCopy(env, "r2", subLocation.objectKey, "r2", nextKey);
        const meta = await storageHead(env, "r2", nextKey);
        await upsertFileIndex(env, nextKey, {
          size: meta?.size,
          httpMetadata: meta?.httpMetadata,
          storageId: "r2",
          objectKey: nextKey,
        });
      }
      if (move) {
        await deletePathEntry(env, logicalKey, "r2", subLocation.objectKey);
      }
    }
  });
}
