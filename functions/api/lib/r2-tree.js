import { assertCompleteListing, listR2Objects } from './common.js';
import { deleteFileIndexKey, upsertFileIndex } from './file-index.js';

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

export async function copyR2Object(env, sourceKey, targetKey) {
  const obj = await env.R2.get(sourceKey);
  if (!obj) return false;
  await env.R2.put(targetKey, obj.body, { httpMetadata: obj.httpMetadata });
  await upsertFileIndex(env, targetKey, obj);
  return true;
}

export async function copyTree(env, sourceKey, targetKey, move = false) {
  const obj = await env.R2.get(sourceKey);
  const listed = await listR2Objects(env.R2, { prefix: sourceKey + '/' });
  assertCompleteListing(listed, `Path ${sourceKey}`);

  if (obj) {
    await env.R2.put(targetKey, obj.body, { httpMetadata: obj.httpMetadata });
    await upsertFileIndex(env, targetKey, obj);
    if (move) {
      await env.R2.delete(sourceKey);
      await deleteFileIndexKey(env, sourceKey);
    }
  }

  await mapWithConcurrency(listed.objects, 6, async item => {
    const nextKey = targetKey + item.key.slice(sourceKey.length);
    const subObj = await env.R2.get(item.key);
    if (subObj) {
      await env.R2.put(nextKey, subObj.body, { httpMetadata: subObj.httpMetadata });
      await upsertFileIndex(env, nextKey, subObj);
      if (move) {
        await env.R2.delete(item.key);
        await deleteFileIndexKey(env, item.key);
      }
    }
  });
}
