const WINDOWS_RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;
const MAX_NAME_BYTES = 255;

export function normalizeName(name) {
  const clean = String(name || "").trim();
  if (
    !clean ||
    clean === "." ||
    clean === ".." ||
    /[\/\\\0]/.test(clean) ||
    /[\u0000-\u001f\u007f]/.test(clean)
  ) {
    throw new Error("Invalid name");
  }
  if (WINDOWS_RESERVED.test(clean))
    throw new Error("Invalid name: reserved name");
  const encoder = new TextEncoder();
  if (encoder.encode(clean).byteLength > MAX_NAME_BYTES)
    throw new Error("Invalid name: too long");
  return clean;
}

export function normalizeHiddenPath(path) {
  const clean = String(path || "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
  if (!clean) throw new Error("Invalid path");
  return clean.split("/").map(normalizeName).join("/");
}

export function isHiddenKey(key, hiddenPaths) {
  return hiddenPaths.some((hp) => key === hp || key.startsWith(hp + "/"));
}

export const RESERVED_PREFIXES = [
  ".trash",
  ".thumbs",
  ".meta",
  ".system",
  "objects",
];

export function isReservedKey(key) {
  const clean = String(key || "").replace(/^\/+|\/+$/g, "");
  return RESERVED_PREFIXES.some(
    (prefix) => clean === prefix || clean.startsWith(prefix + "/"),
  );
}

export function isTrashKey(key) {
  const clean = String(key || "").replace(/^\/+|\/+$/g, "");
  return clean === ".trash" || clean.startsWith(".trash/");
}
