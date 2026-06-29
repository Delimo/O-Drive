export function thresholdAlert(value, config = {}) {
  if (config.enabled === false) return null;
  const current = Number(value || 0);
  const warning = Number(config.warning ?? config.warningThreshold ?? 0);
  const error = Number(config.error ?? config.errorThreshold ?? 0);
  if (Number.isFinite(error) && error > 0 && current >= error) {
    return { level: "error", threshold: error };
  }
  if (Number.isFinite(warning) && warning > 0 && current >= warning) {
    return { level: "warning", threshold: warning };
  }
  return null;
}
