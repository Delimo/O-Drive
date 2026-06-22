import { resolveExistingObjectLocation, storageGet } from "./storage.js";

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
    response = new Response(sourceObj.body, {
      headers: {
        "Content-Type": contentType || "application/octet-stream",
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
      },
    });
  }

  if (!response.ok) {
    response = new Response(sourceObj.body, {
      headers: {
        "Content-Type": contentType || "application/octet-stream",
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
      },
    });
  }

  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "public, max-age=86400, s-maxage=604800");
  headers.set("X-Thumbnail-Cache", "MISS");
  const thumbnail = new Response(response.body, {
    status: response.status,
    headers,
  });

  if (cache) context?.waitUntil?.(cache.put(cacheKey, thumbnail.clone()));

  return thumbnail;
}
