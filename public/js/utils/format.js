export function formatBytes(value) {
  const size = Number(value || 0);
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(size) / Math.log(1024)),
    units.length - 1,
  );
  const scaled = size / 1024 ** index;
  return `${scaled >= 100 || index === 0 ? scaled.toFixed(0) : scaled.toFixed(1)} ${units[index]}`;
}

const _timeFmt = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatTime(value) {
  const time = Number(value || 0);
  if (!time) return "未知时间";
  return _timeFmt.format(new Date(time * 1000));
}

export function formatRelative(value) {
  const time = Number(value || 0);
  if (!time) return "刚刚";
  const diff = Date.now() - time * 1000;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "刚刚";
  if (diff < hour) return `${Math.max(1, Math.round(diff / minute))} 分钟前`;
  if (diff < day) return `${Math.max(1, Math.round(diff / hour))} 小时前`;
  return `${Math.max(1, Math.round(diff / day))} 天前`;
}

export function humanSort(mode) {
  if (mode === "time") return "时间";
  if (mode === "size") return "大小";
  return "名称";
}

export function humanView(mode) {
  return mode === "list" ? "列表" : "网格";
}
