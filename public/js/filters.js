import { Utils } from './utils.js';

const typeFilters = {
  all: () => true,
  folder: item => !item.sizeFormatted,
  file: item => Boolean(item.sizeFormatted),
  image: item => Utils.getFileKind(item.name) === 'image',
  video: item => Utils.getFileKind(item.name) === 'video',
  audio: item => Utils.getFileKind(item.name) === 'audio',
  text: item => Utils.getFileKind(item.name) === 'text',
  pdf: item => Utils.getFileKind(item.name) === 'pdf',
  archive: item => Utils.getFileKind(item.name) === 'archive',
};

function parseSizeInput(value) {
  if (value === '' || value == null) return null;
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num * 1024 : null;
}

export function matchesFilters(item, filters = {}) {
  const kind = filters.kind || 'all';
  if (typeFilters[kind] && !typeFilters[kind](item)) return false;

  const size = item.rawSize || 0;
  const minSize = parseSizeInput(filters.minSize);
  const maxSize = parseSizeInput(filters.maxSize);
  if (minSize != null && size < minSize) return false;
  if (maxSize != null && size > maxSize) return false;

  const time = item.time || 0;
  if (filters.modifiedAfter) {
    const after = new Date(`${filters.modifiedAfter}T00:00:00`).getTime();
    if (time < after) return false;
  }
  if (filters.modifiedBefore) {
    const before = new Date(`${filters.modifiedBefore}T23:59:59`).getTime();
    if (time > before) return false;
  }

  return true;
}

export function describeItem(item) {
  const kind = !item.sizeFormatted ? '文件夹' : {
    image: '图片',
    video: '视频',
    audio: '音频',
    text: '文本',
    pdf: 'PDF',
    archive: '压缩包',
    exe: '程序',
  }[Utils.getFileKind(item.name)] || '文件';
  return { ...item, kind };
}
