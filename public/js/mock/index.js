export function isMockMode() {
  return new URLSearchParams(window.location.search).get('mock') === '1';
}

const now = Date.now();
const hour = 3600000;
const day = 86400000;

export const mockFolders = [
  { name: '项目文档', fullKey: '项目文档', time: now - 2 * hour },
  { name: '设计素材', fullKey: '设计素材', time: now - 5 * hour },
  { name: '2026 归档', fullKey: '2026 归档', time: now - 3 * day },
];

export const mockFiles = [
  { name: '产品说明.pdf', fullKey: '产品说明.pdf', rawSize: 2457600, time: now - hour, uploaded: now - hour },
  { name: '合同模板.docx', fullKey: '合同模板.docx', rawSize: 358400, time: now - 4 * hour, uploaded: now - 4 * hour },
  { name: 'banner.png', fullKey: 'banner.png', rawSize: 1843200, time: now - 8 * hour, uploaded: now - 8 * hour },
  { name: '宣传视频.mp4', fullKey: '宣传视频.mp4', rawSize: 52428800, time: now - day, uploaded: now - day },
  { name: 'readme.md', fullKey: 'readme.md', rawSize: 4096, time: now - 2 * day, uploaded: now - 2 * day },
  { name: 'release.zip', fullKey: 'release.zip', rawSize: 10485760, time: now - 3 * day, uploaded: now - 3 * day },
];

export const mockAdminStats = {
  files: {
    count: 128,
    totalSizeFormatted: '1.2 GB',
    folderMarkers: 14,
  },
  trash: {
    count: 6,
    sizeFormatted: '48.5 MB',
    percentOfFiles: 3.9,
  },
  index: {
    recommendation: '正常',
    count: 128,
    latestUpdatedAt: now - 30 * 60 * 1000,
  },
  breakdown: {
    '图片': { count: 42, sizeFormatted: '320 MB' },
    '视频': { count: 8, sizeFormatted: '512 MB' },
    '文档': { count: 35, sizeFormatted: '86 MB' },
    '压缩包': { count: 12, sizeFormatted: '180 MB' },
    '其他': { count: 31, sizeFormatted: '118 MB' },
  },
  latest: [
    { key: '产品说明.pdf', sizeFormatted: '2.3 MB', uploaded: now - hour },
    { key: 'banner.png', sizeFormatted: '1.8 MB', uploaded: now - 8 * hour },
    { key: '宣传视频.mp4', sizeFormatted: '50 MB', uploaded: now - day },
  ],
  attention: [
    { level: 'ok', title: '系统运行正常', body: '索引与存储均处于健康状态，最近 24 小时无异常。' },
    { level: 'warning', title: '回收站提醒', body: '回收站中有 6 个项目，建议定期清理以释放空间。' },
  ],
};

export const mockAdminShares = [
  {
    token: 'mock-abc123',
    name: '产品说明.pdf',
    path: '产品说明.pdf',
    expired: false,
    exhausted: false,
    hasPassword: false,
    allowPreview: true,
    allowDownload: true,
    downloadCount: 3,
    maxDownloads: 0,
    lastAccessedAt: now - 2 * hour,
    lastAccessIp: '192.168.1.10',
    expiresAt: now + 7 * day,
    autoDeleteAt: 0,
  },
  {
    token: 'mock-def456',
    name: '设计素材',
    path: '设计素材',
    expired: true,
    exhausted: false,
    hasPassword: true,
    allowPreview: true,
    allowDownload: false,
    downloadCount: 12,
    maxDownloads: 50,
    lastAccessedAt: now - 3 * day,
    lastAccessIp: '10.0.0.5',
    expiresAt: now - day,
    autoDeleteAt: now + 6 * day,
  },
  {
    token: 'mock-ghi789',
    name: '宣传视频.mp4',
    path: '宣传视频.mp4',
    expired: false,
    exhausted: false,
    hasPassword: false,
    allowPreview: true,
    allowDownload: true,
    downloadCount: 8,
    maxDownloads: 100,
    lastAccessedAt: now - hour,
    lastAccessIp: '172.16.0.20',
    expiresAt: now + 2 * day,
    autoDeleteAt: 0,
  },
  {
    token: 'mock-jkl012',
    name: '内部文档.docx',
    path: '内部文档.docx',
    expired: false,
    exhausted: false,
    hasPassword: true,
    allowPreview: false,
    allowDownload: true,
    downloadCount: 1,
    maxDownloads: 0,
    lastAccessedAt: now - 5 * hour,
    lastAccessIp: '192.168.1.25',
    expiresAt: now + 30 * day,
    autoDeleteAt: 0,
  },
];

export const mockShareItem = {
  name: '产品说明.pdf',
  sizeFormatted: '2.3 MB',
  contentType: 'application/pdf',
  allowPreview: true,
  allowDownload: true,
  mockPreviewHtml: `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:480px;padding:40px;text-align:center;background:linear-gradient(135deg,#f0f9ff 0%,#e0f2fe 50%,#f0f9ff 100%);">
    <div style="width:80px;height:80px;border-radius:24px;background:linear-gradient(135deg,#ff8575 0%,#bf3a2d 100%);display:grid;place-items:center;margin-bottom:24px;">
      <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="white" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>
    </div>
    <h3 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1e293b;">产品说明.pdf</h3>
    <p style="margin:0 0 24px;color:#64748b;font-size:14px;">2.3 MB · PDF 文档</p>
    <div style="padding:20px 28px;border-radius:16px;background:rgba(255,255,255,0.9);border:1px solid rgba(203,213,225,0.6);max-width:400px;">
      <p style="margin:0;color:#475569;font-size:14px;line-height:1.8;text-align:left;">
        这是一份产品说明文档的预览占位内容。<br>
        在设计预览模式下，此处展示的是 mock 数据。<br>
        实际部署后会显示真实的 PDF 预览。
      </p>
    </div>
  </div>`,
};
