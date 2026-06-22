const _keyCache = new Map();

function cacheKey(secret, date, region, service) {
  return `${secret}\0${date}\0${region}\0${service}`;
}

function cleanPath(path = "") {
  return String(path || "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(value) {
  const data =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  return toHex(await crypto.subtle.digest("SHA-256", data));
}

async function hmac(key, value) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      new TextEncoder().encode(value),
    ),
  );
}

async function signingKey(secret, date, region, service) {
  const ck = cacheKey(secret, date, region, service);
  const cached = _keyCache.get(ck);
  if (cached) return cached;
  const kDate = await hmac(new TextEncoder().encode(`AWS4${secret}`), date);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const result = await hmac(kService, "aws4_request");
  _keyCache.set(ck, result);
  return result;
}

function encodePathSegment(value) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function s3ObjectPath(space, key) {
  const objectKey = `${space.prefix || ""}${cleanPath(key)}`;
  return `/${encodePathSegment(space.bucket)}/${objectKey.split("/").map(encodePathSegment).join("/")}`;
}

export async function signedS3Request(
  space,
  method,
  key,
  { body, headers = {}, query = "" } = {},
) {
  if (
    !space.endpoint ||
    !space.bucket ||
    !space.accessKeyId ||
    !space.secretAccessKey
  ) {
    throw new Error(
      `Storage ${space.name || space.id} is not fully configured`,
    );
  }
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const url = new URL(space.endpoint);
  const pathname = s3ObjectPath(space, key);
  const targetUrl = `${url.origin}${pathname}${query}`;
  const payloadHash = body == null ? await sha256Hex("") : "UNSIGNED-PAYLOAD";
  const requestHeaders = new Headers(headers);
  requestHeaders.set("host", url.host);
  requestHeaders.set("x-amz-content-sha256", payloadHash);
  requestHeaders.set("x-amz-date", amzDate);
  const sortedHeaders = [...requestHeaders.entries()]
    .map(([k, v]) => [k.toLowerCase(), String(v).trim()])
    .sort(([a], [b]) => a.localeCompare(b));
  const canonicalHeaders = sortedHeaders
    .map(([k, v]) => `${k}:${v}\n`)
    .join("");
  const signedHeaders = sortedHeaders.map(([k]) => k).join(";");
  const canonicalRequest = [
    method,
    pathname,
    query.replace(/^\?/, ""),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/${space.region || "auto"}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = toHex(
    await hmac(
      await signingKey(
        space.secretAccessKey,
        dateStamp,
        space.region || "auto",
        "s3",
      ),
      stringToSign,
    ),
  );
  requestHeaders.set(
    "authorization",
    `AWS4-HMAC-SHA256 Credential=${space.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  );
  requestHeaders.delete("host");
  const res = await fetch(targetUrl, { method, headers: requestHeaders, body });
  if (!res.ok && res.status !== 404)
    throw new Error(`S3 ${method} failed: HTTP ${res.status}`);
  return res;
}
