function encodeR2Key(key) {
  return String(key || '')
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
}

function isImageKey(key) {
  return /\.(jpe?g|png|gif|webp)$/i.test(key);
}

async function originalImageResponse(env, r2Key) {
  const obj = await env.R2.get(r2Key);
  if (!obj) return new Response('404', { status: 404 });
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}

export async function handleThumbnail(env, request, r2Key, context) {
  if (!isImageKey(r2Key)) return new Response('Unsupported thumbnail type', { status: 415 });

  const url = new URL(request.url);
  const width = Math.min(Math.max(Number(url.searchParams.get('w') || 320), 80), 960);
  const height = Math.min(Math.max(Number(url.searchParams.get('h') || 240), 80), 720);
  url.searchParams.set('w', String(width));
  url.searchParams.set('h', String(height));

  const cacheKey = new Request(url.toString(), request);
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cached = cache ? await cache.match(cacheKey) : null;
  if (cached) {
    const hit = new Response(cached.body, cached);
    hit.headers.set('X-Thumbnail-Cache', 'HIT');
    return hit;
  }

  const sourceUrl = new URL(request.url);
  sourceUrl.pathname = `/api/preview/${encodeR2Key(r2Key)}`;
  sourceUrl.search = '';

  let response;
  try {
    response = await fetch(new Request(sourceUrl.toString(), request), {
      cf: {
        image: {
          width,
          height,
          fit: 'cover',
          quality: 72,
          format: 'auto',
        },
      },
    });
  } catch (e) {
    response = await originalImageResponse(env, r2Key);
  }

  if (!response.ok) return response;

  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'public, max-age=86400, s-maxage=604800');
  headers.set('X-Thumbnail-Cache', 'MISS');
  const thumbnail = new Response(response.body, { status: response.status, headers });

  if (cache) context?.waitUntil?.(cache.put(cacheKey, thumbnail.clone()));

  return thumbnail;
}
