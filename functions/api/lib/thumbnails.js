import { resolveExistingObjectLocation, storageGet, storagePut } from "./storage.js";

const THUMBNAIL_RESIZE_TIMEOUT_MS = 1500;

function isImageKey(key) {
  return /\.(jpe?g|png|gif|webp|avif)$/i.test(key);
}

async function originalImageResponse(env, r2Key) {
  const location = await resolveExistingObjectLocation(env, r2Key);
  const obj = await storageGet(env, location.storageId, location.objectKey);
  if (!obj) return new Response("404", { status: 404 });
  return new Response(obj.body, {
    headers: {
      "Content-Type":
        obj.httpMetadata?.contentType || "application/octet-stream",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}

function thumbnailCacheKey(r2Key, width, height) {
  return `.thumbs/${width}x${height}/${String(r2Key || "").replace(/^\/+/, "")}`;
}

function thumbnailHeaders(sourceHeaders = new Headers(), contentType = "") {
  const headers = new Headers(sourceHeaders);
  headers.set("Cache-Control", "public, max-age=86400, s-maxage=604800");
  if (contentType && !headers.get("Content-Type")) {
    headers.set("Content-Type", contentType);
  }
  return headers;
}

function fallbackImageResponse(sourceObj, contentType) {
  return new Response(sourceObj.body, {
    headers: {
      "Content-Type": contentType || "application/octet-stream",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "X-Thumbnail-Fallback": "original",
    },
  });
}

async function resizedImageResponse(request, sourceUrl, width, height) {
  const controller =
    typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => controller.abort(), THUMBNAIL_RESIZE_TIMEOUT_MS)
    : null;
  try {
    return await fetch(new Request(sourceUrl.toString(), request), {
      signal: controller?.signal,
      cf: {
        image: {
          width,
          height,
          fit: "cover",
          quality: 72,
          format: "auto",
        },
      },
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function handleThumbnail(env, request, r2Key, context) {
  if (!isImageKey(r2Key))
    return new Response("Unsupported thumbnail type", { status: 415 });

  const url = new URL(request.url);
  const width = Math.min(
    Math.max(Number(url.searchParams.get("w") || 320), 80),
    960,
  );
  const height = Math.min(
    Math.max(Number(url.searchParams.get("h") || 240), 80),
    720,
  );
  url.searchParams.set("w", String(width));
  url.searchParams.set("h", String(height));

  const cacheKey = new Request(url.toString(), request);
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const cached = cache ? await cache.match(cacheKey) : null;
  if (cached) {
    const hit = new Response(cached.body, cached);
    hit.headers.set("X-Thumbnail-Cache", "HIT");
    return hit;
  }

  const r2ThumbnailKey = thumbnailCacheKey(r2Key, width, height);
  const storedThumbnail = await storageGet(env, "r2", r2ThumbnailKey);
  if (storedThumbnail) {
    const headers = thumbnailHeaders(
      new Headers(),
      storedThumbnail.httpMetadata?.contentType || "image/webp",
    );
    headers.set("X-Thumbnail-Cache", "R2-HIT");
    return new Response(storedThumbnail.body, { headers });
  }

  // Call storage directly instead of routing through /api/preview/ pipeline
  let sourceObj;
  try {
    const location = await resolveExistingObjectLocation(env, r2Key);
    sourceObj = await storageGet(env, location.storageId, location.objectKey);
  } catch (_) {}

  if (!sourceObj) return new Response("404", { status: 404 });

  // Validate content type is actually an image
  const contentType = sourceObj.httpMetadata?.contentType || "";
  if (contentType && !contentType.startsWith("image/") && !contentType.startsWith("application/octet-stream")) {
    return new Response("Not an image", { status: 415 });
  }

  const sourceUrl = new URL(request.url);
  sourceUrl.pathname = `/api/preview/thumb-source`;
  sourceUrl.search = "";

  let response;
  try {
    response = await resizedImageResponse(request, sourceUrl, width, height);
  } catch (e) {
    response = fallbackImageResponse(sourceObj, contentType);
  }

  if (!response.ok) {
    response = fallbackImageResponse(sourceObj, contentType);
  }

  const headers = thumbnailHeaders(response.headers, contentType);
  headers.set("X-Thumbnail-Cache", "MISS");
  const thumbnail = new Response(response.body, {
    status: response.status,
    headers,
  });

  if (cache) context?.waitUntil?.(cache.put(cacheKey, thumbnail.clone()));
  if (!headers.get("X-Thumbnail-Fallback")) {
    const storeTask = thumbnail
      .clone()
      .arrayBuffer()
      .then((body) =>
        storagePut(env, "r2", r2ThumbnailKey, body, {
          httpMetadata: {
            contentType: headers.get("Content-Type") || contentType || "image/webp",
          },
        }),
      )
      .catch(() => {});
    if (context?.waitUntil) context.waitUntil(storeTask);
    else await storeTask;
  }

  return thumbnail;
}
