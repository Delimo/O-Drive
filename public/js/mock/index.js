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
    exhausted: true,
    hasPassword: true,
    allowPreview: false,
    allowDownload: true,
    downloadCount: 10,
    maxDownloads: 10,
    lastAccessedAt: now - 5 * hour,
    lastAccessIp: '192.168.1.25',
    expiresAt: now + 30 * day,
    autoDeleteAt: 0,
  },
];

export const mockAdminHealth = {
  components: {
    storage: { status: 'ok', message: '存储服务运行正常' },
    database: { status: 'ok', message: '数据库连接正常' },
    index: { status: 'ok', message: '索引服务运行正常' },
    cache: { status: 'ok', message: '缓存服务运行正常' },
  },
};

export function mockAdminLogs(page = 1) {
  const allItems = [
    { action: 'upload', path: '/产品说明.pdf', user: 'admin', ip: '192.168.1.10', createdAt: Date.now() - 60000, detail: '上传文件 (1.2 MB)' },
    { action: 'create', path: '/项目文档', user: 'admin', ip: '192.168.1.10', createdAt: Date.now() - 120000, detail: '新建文件夹' },
    { action: 'share', path: '/产品说明.pdf', user: 'admin', ip: '192.168.1.10', createdAt: Date.now() - 180000, detail: '创建分享链接' },
    { action: 'delete', path: '/旧文档.docx', user: 'admin', ip: '10.0.0.5', createdAt: Date.now() - 3600000, detail: '移入回收站' },
    { action: 'login', path: '/', user: 'admin', ip: '192.168.1.10', createdAt: Date.now() - 7200000, detail: '管理员登录' },
    { action: 'update', path: '/readme.md', user: 'admin', ip: '192.168.1.10', createdAt: Date.now() - 86400000, detail: '编辑文件内容' },
    { action: 'upload', path: '/banner.png', user: 'admin', ip: '172.16.0.20', createdAt: Date.now() - 2 * 86400000, detail: '上传文件 (1.8 MB)' },
    { action: 'share', path: '/设计素材', user: 'admin', ip: '10.0.0.5', createdAt: Date.now() - 3 * 86400000, detail: '创建文件夹分享' },
    { action: 'delete', path: '/临时文件.txt', user: 'admin', ip: '192.168.1.10', createdAt: Date.now() - 5 * 86400000, detail: '移入回收站' },
    { action: 'upload', path: '/release.zip', user: 'admin', ip: '172.16.0.20', createdAt: Date.now() - 7 * 86400000, detail: '上传文件 (10 MB)' },
  ];
  const size = 5;
  const start = (page - 1) * size;
  const items = allItems.slice(start, start + size);
  return { items, page, totalPages: Math.ceil(allItems.length / size) };
}

export const mockAdminQuota = {
  used: 1288490188,
  total: 5368709120,
  count: 128,
};

export const mockProtectedPaths = [
  { path: '/私密文档', password: '***', note: '内部敏感资料', showName: '机密文件夹' },
  { path: '/客户合同', password: '***', note: '仅限管理层访问', showName: '' },
];

export const mockHiddenPaths = [
  { path: '/.env' },
  { path: '/config' },
  { path: '/内部资料/薪酬' },
];

export const mockWebhooks = [
  {
    id: 'wh-1',
    name: '文件事件通知',
    msgtype: 'json',
    url: 'https://hooks.example.com/odrive',
    method: 'POST',
    contentType: 'application/json',
    headers: { 'X-Source': 'odrive' },
    body: '',
    events: ['file.uploaded', 'file.deleted', 'file.renamed'],
    enabled: true,
  },
  {
    id: 'wh-2',
    name: '管理告警',
    msgtype: 'markdown',
    url: 'https://chat.example.com/hooks/abc123',
    method: 'POST',
    contentType: 'application/json',
    headers: {},
    body: '{"text":"{{message}}"}',
    events: ['admin.login_failure', 'download.burst'],
    enabled: false,
  },
];

export const mockWebhookDeliveries = [
  { id: 1, event: 'file.uploaded', endpoint: '文件事件通知', url: 'https://hooks.example.com/odrive', ok: 1, status: 200, error: '', duration_ms: 342, created_at: new Date(Date.now() - 60000).toISOString() },
  { id: 2, event: 'file.deleted', endpoint: '文件事件通知', url: 'https://hooks.example.com/odrive', ok: 1, status: 200, error: '', duration_ms: 287, created_at: new Date(Date.now() - 300000).toISOString() },
  { id: 3, event: 'admin.login_failure', endpoint: '管理告警', url: 'https://chat.example.com/hooks/abc123', ok: 0, status: 0, error: 'Connection timeout', duration_ms: 5000, created_at: new Date(Date.now() - 3600000).toISOString() },
];

export const mockStorageConfig = {
  r2: {
    id: 'r2',
    name: 'Cloudflare R2',
    provider: 'r2',
    quotaBytes: 10737418240,
    quotaFormatted: '10 GB',
    usedBytes: 3221225472,
    usedFormatted: '3.0 GB',
    usedPercent: 30,
  },
  overflowEnabled: true,
  overflowThresholdPercent: 85,
  spaces: [
    {
      id: 'backup-s3',
      name: 'Backup S3',
      provider: 's3',
      endpoint: 'https://s3.us-east-1.amazonaws.com',
      region: 'us-east-1',
      bucket: 'my-backup-bucket',
      prefix: 'odrive/',
      quotaBytes: 53687091200,
      quotaFormatted: '50 GB',
      usedBytes: 10737418240,
      usedFormatted: '10 GB',
      usedPercent: 20,
      enabled: true,
      overflowTarget: true,
      hasSecret: true,
    },
  ],
  bindings: [
    { path: '/backup', storageId: 'backup-s3' },
  ],
};

export const mockReadme = `# O-Drive 使用说明

这是 **设计预览模式** 下的 Markdown 示例内容，用于演示渲染效果。

## 功能亮点

- 文件上传与队列进度
- 在线预览：图片 / 视频 / 音频 / PDF / 文本
- *Markdown* 渲染与原文切换
- 分享链接与后台管理

## 快速开始

1. 点击「上传」选择文件
2. 在列表中点击文件进行预览
3. 使用顶部搜索框快速定位

> 提示：实际部署后，这里会显示文件的真实文本内容。

\`\`\`
GET /api/files
Authorization: session
\`\`\`

更多说明见 [项目主页](https://example.com)。
`;

export function mockTextContent(entry) {
  const name = entry?.name || '';
  if (/\.(md|markdown)$/i.test(name)) return mockReadme;
  return `这是 ${name} 的设计预览占位文本内容。\n\n实际部署后会显示文件的真实文本。`;
}

export const mockMaintenanceSnapshot = {
  indexCount: 128,
  indexTotalSize: 1288490188800,
  indexTotalSizeFormatted: '1.2 GB',
  indexFresh: true,
  r2SampleCount: 128,
  r2SampleTruncated: false,
  accessAttemptCount: 0,
  trashCount: 6,
  logsCount: 142,
  taskCount: 0,
  thumbnailsPresent: true,
};

export const mockTasks = [
  {
    id: 'task-upload-001',
    type: 'upload',
    status: 'completed',
    total: 5,
    completed: 5,
    failed: 0,
    payload: { files: [
      { name: '产品说明.pdf', size: 2457600 },
      { name: 'banner.png', size: 1843200 },
      { name: '宣传视频.mp4', size: 52428800 },
      { name: 'readme.md', size: 4096 },
      { name: 'release.zip', size: 10485760 },
    ]},
    createdAt: now - 30 * 60 * 1000,
    finishedAt: now - 25 * 60 * 1000,
  },
  {
    id: 'task-upload-002',
    type: 'upload',
    status: 'partial',
    total: 3,
    completed: 2,
    failed: 1,
    payload: { files: [
      { name: '设计稿.fig', size: 15728640 },
      { name: '素材包.zip', size: 8388608 },
      { name: '损坏文件.bin', size: 123456 },
    ]},
    createdAt: now - 2 * hour,
    finishedAt: now - 90 * 60 * 1000,
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
