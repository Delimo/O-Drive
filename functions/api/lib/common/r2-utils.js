export function waitForWebhook(context, promise) {
  if (!promise) return;
  if (typeof context?.waitUntil === "function")
    context.waitUntil(promise.catch(() => {}));
  else promise.catch(() => {});
}

export function assertCompleteListing(listed, details = "Object listing") {
  if (!listed?.truncated) return;
  const err = new Error(`${details} is too large to process in one request`);
  err.status = 413;
  err.code = "LISTING_TRUNCATED";
  throw err;
}

export async function listR2Objects(
  bucket,
  options = {},
  { maxObjects = 10000 } = {},
) {
  const objects = [];
  const delimitedPrefixes = [];
  let cursor = options.cursor;

  do {
    const listed = await bucket.list({ ...options, cursor });
    objects.push(...(listed.objects || []));
    delimitedPrefixes.push(...(listed.delimitedPrefixes || []));
    cursor = listed.truncated ? listed.cursor : undefined;
    if (objects.length >= maxObjects) break;
  } while (cursor);

  return {
    objects: objects.slice(0, maxObjects),
    delimitedPrefixes,
    truncated: Boolean(cursor),
    cursor,
  };
}
