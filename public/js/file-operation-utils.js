import { api } from './api.js';
import { Message } from './ui.js';

function formatPathList(paths = [], limit = 8) {
  const lines = paths.slice(0, limit).map(path => `- ${path}`);
  if (paths.length > limit) lines.push(`- 另有 ${paths.length - limit} 项未显示`);
  return lines.join('\n');
}

export function confirmDanger(title, paths = [], extra = '', { danger = false } = {}) {
  const parts = [formatPathList(paths), extra].filter(Boolean);
  return window.showConfirm(title, parts.join('\n'), { danger });
}

export async function operationEstimateText(paths = []) {
  try {
    const { res, data } = await api.operationEstimate(paths);
    if (!res.ok || !data?.success) return '';
    const folderCount = (data.items || []).filter(item => item.kind === 'folder').length;
    const missingCount = (data.items || []).filter(item => !item.exists).length;
    const lines = [`预计涉及 ${data.totalObjects || 0} 个存储对象。`];
    if (folderCount) lines.push(`其中包含 ${folderCount} 个文件夹或目录树。`);
    if (missingCount) lines.push(`${missingCount} 项可能已不存在。`);
    if (data.truncated) lines.push('部分目录超过预估扫描上限，实际数量可能更多。');
    if (data.shouldBatch) lines.push(`这是超大操作，建议每批不超过 ${data.recommendedBatchSize || 1000} 个对象，分批处理更稳。`);
    else if (data.large) lines.push('这是较大的操作，建议确认路径无误，执行期间请等待完成提示。');
    return lines.join('\n');
  } catch (_) {
    return '';
  }
}

export async function operationEstimate(paths = []) {
  try {
    const { res, data } = await api.operationEstimate(paths);
    return res.ok && data?.success ? data : null;
  } catch (_) {
    return null;
  }
}

export function shouldUseTask(estimate) {
  return Boolean(estimate?.large || estimate?.shouldBatch || Number(estimate?.totalObjects || 0) >= 200);
}

export async function startAndWatchTask(type, payload, doneMessage, onDone) {
  const created = await api.createTask(type, payload);
  if (!created.res.ok || !created.data?.item?.id) {
    Message.error(readableError(created.res, created.data, '任务创建失败'));
    return false;
  }
  const id = created.data.item.id;
  Message.show('任务已创建，正在后台处理...');
  for (let i = 0; i < 120; i++) {
    await new Promise(resolve => setTimeout(resolve, i < 10 ? 800 : 1500));
    const { res, data } = await api.fileTask(id);
    if (!res.ok) continue;
    const item = data?.item;
    if (!item || !['completed', 'partial', 'failed'].includes(item.status)) continue;
    if (item.status === 'completed') Message.success(doneMessage);
    else Message.error(`任务结束：完成 ${item.completed || 0} 项，失败 ${item.failed || 0} 项`);
    if (onDone) await onDone(item);
    return item.status !== 'failed';
  }
  Message.show('任务仍在后台处理，可稍后刷新查看结果');
  return true;
}

export function readableError(res, data, fallback = '操作失败') {
  const message = data?.failed?.[0]?.message || data?.message || '';
  if (res?.status === 401) return '登录状态已失效，请重新登录后再试。';
  if (res?.status === 403) {
    if (/csrf/i.test(message)) return '安全校验已过期，请刷新页面后重试。';
    if (/reserved/i.test(message)) return '系统保留目录不能被修改。';
    return '没有权限执行这个操作。';
  }
  if (res?.status === 409 || /already exists/i.test(message)) return '目标位置已有同名文件或文件夹，请重命名后再试。';
  if (res?.status === 413 || /too large/i.test(message)) return '项目太大，无法在一次请求中完成，请分批处理。';
  if (/not found/i.test(message)) return '文件或文件夹不存在，可能已被移动或删除。';
  if (/invalid/i.test(message)) return '输入内容不合法，请检查名称或路径。';
  return message || fallback;
}
