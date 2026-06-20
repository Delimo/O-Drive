export function parseCapacityBytes(value, fallback = 0) {
  if (typeof value === "number") {
    return Math.max(0, Math.floor(Number.isFinite(value) ? value : fallback));
  }
  const raw = String(value ?? "").trim();
  if (!raw) return Math.max(0, Math.floor(fallback || 0));
  const match = raw.match(/^(\d+(?:\.\d+)?)\s*([kmgtp]?i?b?|b)?$/i);
  if (!match) return Math.max(0, Math.floor(Number(raw) || fallback || 0));
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return Math.max(0, Math.floor(fallback || 0));
  const unit = String(match[2] || "b").toLowerCase();
  const powers = {
    b: 0,
    k: 1,
    kb: 1,
    kib: 1,
    m: 2,
    mb: 2,
    mib: 2,
    g: 3,
    gb: 3,
    gib: 3,
    t: 4,
    tb: 4,
    tib: 4,
    p: 5,
    pb: 5,
    pib: 5,
  };
  return Math.max(0, Math.floor(amount * 1024 ** (powers[unit] ?? 0)));
}
