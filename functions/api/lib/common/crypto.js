export function base64UrlToUint8Array(value) {
  const base64 =
    value.replace(/-/g, "+").replace(/_/g, "/") +
    "===".slice((value.length + 3) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function encodeBase64Url(value) {
  return btoa(value).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function decodeBase64UrlJson(value) {
  return JSON.parse(new TextDecoder().decode(base64UrlToUint8Array(value)));
}
