import test from 'node:test';
import assert from 'node:assert/strict';

import { onRequest } from '../functions/api/[[path]].js';
import { handleListFiles, handleDownloadOrPreview, handleSearch } from '../functions/api/lib/file-reads.js';
import {
  handleMultipartCreate,
  handleMultipartPart,
  handleMultipartComplete,
  handleMultipartAbort,
  handleRename,
  handleOperationEstimate,
  handleTrashList,
  handleTrashRestore,
  handleTrashDelete,
  handleTrashClear,
  handleTrashCleanup,
  handleTrashRetention,
  handlePaste,
} from '../functions/api/lib/file-mutations.js';
import { handleAdminHealth, handleAdminStats } from '../functions/api/lib/admin.js';
import { handleThumbnail } from '../functions/api/lib/thumbnails.js';
import { getR2KeyFromPath, canReadKey } from '../functions/api/lib/request-context.js';
import { handleLogin, verifyAuth, verifyCsrf } from '../functions/api/lib/auth.js';
import { indexedFileCount, upsertFileIndex } from '../functions/api/lib/file-index.js';
import { setStorageQuota as setStorageQuotaForTest } from '../functions/api/lib/storage-quota.js';
import {
  handleProtectedSettings,
  handleProtectedUnlock,
  loadProtectedPaths,
  checkProtectedAccess,
} from '../functions/api/lib/protected-paths.js';
import { encodeR2Path, apiFileUrl } from '../public/js/file-paths.js';
import { getOrderedEntries, getSelectableKeys } from '../public/js/file-view-model.js';

function makeEnv({ objects = [], prefixes = [], listPageSize = Infinity } = {}) {
  const byKey = new Map(objects.map(o => [o.key, { ...o }]));
  const trashRows = [];
  const protectedRows = [];
  const pathAttemptRows = [];
  const loginAttemptRows = [];
  const settingsRows = new Map();
  const kvRows = new Map();
  const fileIndexRows = [];
  const logs = [];
  const sizeOf = body => typeof body === 'string' ? body.length : body?.byteLength || 0;
  const listObjects = (prefix = '') => [...byKey.values()]
    .filter(obj => obj.key.startsWith(prefix))
    .map(obj => ({
      key: obj.key,
      size: obj.size ?? sizeOf(obj.body),
      uploaded: obj.uploaded || new Date('2026-01-01'),
    }));
  const filteredTrashRows = (bound = []) => {
    let rows = [...trashRows];
    let idx = 0;
    if (bound.length >= 2 && typeof bound[idx] === 'string' && String(bound[idx]).startsWith('%')) {
      const q = String(bound[idx]).replace(/%/g, '').toLowerCase();
      idx += 2;
      rows = rows.filter(row => row.original_key.toLowerCase().includes(q) || row.name.toLowerCase().includes(q));
    }
    if (['file', 'folder'].includes(bound[idx])) {
      const kind = bound[idx++];
      rows = rows.filter(row => row.kind === kind);
    }
    if (typeof bound[idx] === 'number') {
      const from = bound[idx++];
      rows = rows.filter(row => row.trashed_at >= from);
    }
    if (typeof bound[idx] === 'number') {
      const to = bound[idx++];
      rows = rows.filter(row => row.trashed_at <= to);
    }
    return rows;
  };
  return {
    R2: {
      async head(key) {
        const obj = byKey.get(key);
        if (!obj) return null;
        return {
          key,
          size: obj.size ?? (typeof obj.body === 'string' ? obj.body.length : 0),
          uploaded: obj.uploaded || new Date('2026-01-01'),
          httpMetadata: obj.httpMetadata || { contentType: 'text/plain' },
          writeHttpMetadata(headers) {
            if (obj.httpMetadata?.contentType) headers.set('Content-Type', obj.httpMetadata.contentType);
          },
        };
      },
      async list(opts = {}) {
        const prefix = opts.prefix || '';
        const delimiter = opts.delimiter;
        const cursor = Number(opts.cursor || 0);
        const limit = Math.min(Number(opts.limit || listPageSize), listPageSize);
        const objectsFromStore = listObjects(prefix);
        if (!delimiter) {
          const page = objectsFromStore.slice(cursor, cursor + limit);
          const nextCursor = cursor + page.length;
          return {
            delimitedPrefixes: [],
            objects: page,
            truncated: nextCursor < objectsFromStore.length,
            cursor: String(nextCursor),
          };
        }
        const folderSet = new Set(
          prefixes
            .filter(p => p.startsWith(prefix))
            .map(p => p)
        );
        for (const key of byKey.keys()) {
          if (!key.startsWith(prefix)) continue;
          const rest = key.slice(prefix.length);
          const idx = rest.indexOf('/');
          if (idx > 0) folderSet.add(prefix + rest.slice(0, idx + 1));
        }
        return {
          delimitedPrefixes: [...folderSet],
          objects: objectsFromStore.filter(obj => !obj.key.slice(prefix.length).includes('/')),
        };
      },
      async get(key) {
        const obj = byKey.get(key);
        if (!obj) return null;
        return {
          body: obj.body || 'content',
          httpMetadata: obj.httpMetadata || { contentType: 'text/plain' },
          size: obj.size ?? sizeOf(obj.body),
        };
      },
      async put(key, body, options = {}) {
        byKey.set(key, { key, body, httpMetadata: options.httpMetadata || {}, size: sizeOf(body) });
      },
      async delete(key) {
        byKey.delete(key);
      },
      async createMultipartUpload(key) {
        return {
          key,
          uploadId: 'upload-1',
        };
      },
      resumeMultipartUpload(key, uploadId) {
        return {
          key,
          uploadId,
          async uploadPart(partNumber) {
            return { partNumber, etag: `etag-${partNumber}` };
          },
          async complete(parts) {
            return { key, httpEtag: `complete-${parts.length}` };
          },
          async abort() {},
        };
      },
    },
    D1: {
      async batch(statements) {
        const results = [];
        for (const stmt of statements) {
          const sql = stmt.sql || '';
          if (/^\s*(INSERT|UPDATE|DELETE|CREATE)/i.test(sql)) {
            results.push(await stmt.run());
          } else {
            try {
              const result = await stmt.all();
              results.push(result);
            } catch (_) {
              try {
                results.push(await stmt.first());
              } catch (_2) {
                results.push(null);
              }
            }
          }
        }
        return results;
      },
      prepare(sql) {
        const statement = {
          sql,
          bind(...params) {
            statement.bound = params;
            return statement;
          },
          async run() {
            if (/INSERT INTO logs/i.test(sql)) {
              logs.push({ action: statement.bound?.[0], details: statement.bound?.[1], ip: statement.bound?.[2] });
            }
            if (/INSERT INTO trash/i.test(sql)) {
              trashRows.push({
                id: statement.bound?.[0],
                original_key: statement.bound?.[1],
                trash_key: statement.bound?.[2],
                name: statement.bound?.[3],
                kind: statement.bound?.[4],
                size: statement.bound?.[5],
                trashed_at: statement.bound?.[6],
              });
            }
            if (/INSERT INTO path_passwords/i.test(sql)) {
              const row = {
                path: statement.bound?.[0],
                salt: statement.bound?.[1],
                password_hash: statement.bound?.[2],
                note: statement.bound?.[3],
                show_name: statement.bound?.[4],
                created_at: statement.bound?.[5],
              };
              const idx = protectedRows.findIndex(item => item.path === row.path);
              if (idx >= 0) protectedRows[idx] = row;
              else protectedRows.push(row);
            }
            if (/INSERT INTO file_index/i.test(sql)) {
              const row = {
                path: statement.bound?.[0],
                name: statement.bound?.[1],
                parent: statement.bound?.[2],
                kind: statement.bound?.[3],
                size: statement.bound?.[4],
                content_type: statement.bound?.[5],
                uploaded_at: statement.bound?.[6],
                updated_at: statement.bound?.[7],
              };
              const idx = fileIndexRows.findIndex(item => item.path === row.path);
              if (idx >= 0) fileIndexRows[idx] = row;
              else fileIndexRows.push(row);
            }
            if (/INSERT INTO path_access_attempts/i.test(sql)) {
              const row = {
                path: statement.bound?.[0],
                ip: statement.bound?.[1],
                attempts: 1,
                last_attempt: statement.bound?.[2],
              };
              const idx = pathAttemptRows.findIndex(item => item.path === row.path && item.ip === row.ip);
              if (idx >= 0) {
                pathAttemptRows[idx].attempts += 1;
                pathAttemptRows[idx].last_attempt = row.last_attempt;
              } else {
                pathAttemptRows.push(row);
              }
            }
            if (/INSERT INTO login_attempts/i.test(sql)) {
              const row = {
                ip: statement.bound?.[0],
                attempts: 1,
                last_attempt: statement.bound?.[1],
              };
              const idx = loginAttemptRows.findIndex(item => item.ip === row.ip);
              if (idx >= 0) {
                loginAttemptRows[idx].attempts += 1;
                loginAttemptRows[idx].last_attempt = row.last_attempt;
              } else {
                loginAttemptRows.push(row);
              }
            }
            if (/INSERT OR REPLACE INTO settings/i.test(sql)) {
              settingsRows.set('trash_retention_days', statement.bound?.[0]);
            }
            if (/INSERT OR REPLACE INTO kv_config/i.test(sql)) {
              kvRows.set(statement.bound?.[0], statement.bound?.[1]);
            }
            if (/INSERT OR IGNORE INTO settings/i.test(sql)) {
              settingsRows.set(statement.bound?.[0], 'hidden');
            }
            if (/DELETE FROM trash WHERE id = \?/i.test(sql)) {
              const id = statement.bound?.[0];
              const idx = trashRows.findIndex(row => row.id === id);
              if (idx >= 0) trashRows.splice(idx, 1);
            }
            if (/DELETE FROM path_passwords WHERE path = \?/i.test(sql)) {
              const path = statement.bound?.[0];
              const idx = protectedRows.findIndex(row => row.path === path);
              if (idx >= 0) protectedRows.splice(idx, 1);
            }
            if (/DELETE FROM path_access_attempts WHERE path = \? AND ip = \?/i.test(sql)) {
              const [path, ip] = statement.bound || [];
              const idx = pathAttemptRows.findIndex(row => row.path === path && row.ip === ip);
              if (idx >= 0) pathAttemptRows.splice(idx, 1);
            }
            if (/DELETE FROM login_attempts WHERE ip = \?/i.test(sql)) {
              const ip = statement.bound?.[0];
              const idx = loginAttemptRows.findIndex(row => row.ip === ip);
              if (idx >= 0) loginAttemptRows.splice(idx, 1);
            }
            if (/DELETE FROM kv_config WHERE key = 'webhook_urls'/i.test(sql)) {
              kvRows.delete('webhook_urls');
            }
            if (/DELETE FROM file_index WHERE path = \?/i.test(sql)) {
              const path = statement.bound?.[0];
              const idx = fileIndexRows.findIndex(row => row.path === path);
              if (idx >= 0) fileIndexRows.splice(idx, 1);
            }
            if (/DELETE FROM file_index WHERE path = \? OR path LIKE \?/i.test(sql)) {
              const path = statement.bound?.[0];
              const prefix = String(statement.bound?.[1] || '').replace(/%$/, '');
              for (let i = fileIndexRows.length - 1; i >= 0; i--) {
                if (fileIndexRows[i].path === path || fileIndexRows[i].path.startsWith(prefix)) fileIndexRows.splice(i, 1);
              }
            }
            if (/DELETE FROM file_index$/i.test(sql.trim())) {
              fileIndexRows.length = 0;
            }
            if (/DELETE FROM path_access_attempts$/i.test(sql.trim())) {
              pathAttemptRows.length = 0;
            }
            return {};
          },
          async first() {
            if (/SELECT COUNT\(\*\) as count FROM file_index/i.test(sql)) return { count: fileIndexRows.length };
            if (/SELECT COUNT\(\*\) as count FROM path_access_attempts/i.test(sql)) return { count: pathAttemptRows.length };
            if (/SELECT attempts, last_attempt FROM login_attempts WHERE ip = \?/i.test(sql)) {
              const ip = statement.bound?.[0];
              return loginAttemptRows.find(row => row.ip === ip) || null;
            }
            if (/SELECT attempts, last_attempt FROM path_access_attempts WHERE path = \? AND ip = \?/i.test(sql)) {
              const [path, ip] = statement.bound || [];
              return pathAttemptRows.find(row => row.path === path && row.ip === ip) || null;
            }
            if (/SELECT COUNT\(\*\) as count FROM trash/i.test(sql)) return { count: filteredTrashRows(statement.bound || []).length };
            if (/SELECT \* FROM trash WHERE id = \?/i.test(sql)) return trashRows.find(row => row.id === statement.bound?.[0]) || null;
            if (/SELECT COUNT\(\*\) as count FROM logs/i.test(sql)) return { count: logs.length };
            if (/SELECT value FROM settings WHERE key = 'trash_retention_days'/i.test(sql)) {
              const value = settingsRows.get('trash_retention_days');
              return value == null ? null : { value };
            }
            if (/SELECT value FROM kv_config WHERE key = \?/i.test(sql)) {
              const value = kvRows.get(statement.bound?.[0]);
              return value == null ? null : { value };
            }
            if (/SELECT COALESCE\(SUM\(size\), 0\) AS total FROM file_index/i.test(sql)) {
              return { total: fileIndexRows.reduce((sum, row) => sum + Number(row.size || 0), 0) };
            }
            if (/SELECT COUNT\(\*\) as count, COALESCE\(SUM\(size\), 0\) as totalSize, COALESCE\(MAX\(updated_at\), 0\) as latestUpdatedAt FROM file_index/i.test(sql)) {
              return {
                count: fileIndexRows.length,
                totalSize: fileIndexRows.reduce((sum, row) => sum + Number(row.size || 0), 0),
                latestUpdatedAt: fileIndexRows.reduce((max, row) => Math.max(max, Number(row.updated_at || 0)), 0),
              };
            }
            if (/SELECT value FROM kv_config WHERE key = 'webhook_urls'/i.test(sql)) {
              const value = kvRows.get('webhook_urls');
              return value == null ? null : { value };
            }
            return null;
          },
          async all() {
            if (/SELECT \* FROM file_index WHERE lower\(name\) LIKE \?/i.test(sql)) {
              const like = String(statement.bound?.[0] || '').replace(/%/g, '');
              let rows = fileIndexRows.filter(row => row.name.toLowerCase().includes(like));
              if (/path = \? OR path LIKE \?/i.test(sql)) {
                const scope = statement.bound?.[1];
                const prefix = String(statement.bound?.[2] || '').replace(/%$/, '');
                rows = rows.filter(row => row.path === scope || row.path.startsWith(prefix));
              }
              const limit = statement.bound?.[statement.bound.length - 2] ?? rows.length;
              const offset = statement.bound?.[statement.bound.length - 1] ?? 0;
              return { results: rows.sort((a, b) => a.path.localeCompare(b.path)).slice(offset, offset + limit) };
            }
            if (/SELECT kind, COUNT\(\*\) as count, SUM\(size\) as size FROM file_index GROUP BY kind/i.test(sql)) {
              const byKind = {};
              for (const row of fileIndexRows) {
                if (!byKind[row.kind]) byKind[row.kind] = { kind: row.kind, count: 0, size: 0 };
                byKind[row.kind].count++;
                byKind[row.kind].size += Number(row.size || 0);
              }
              return { results: Object.values(byKind) };
            }
            if (/SELECT COUNT\(\*\) as count, SUM\(size\) as totalSize FROM file_index/i.test(sql)) {
              const totalSize = fileIndexRows.reduce((sum, r) => sum + Number(r.size || 0), 0);
              return { results: [{ count: fileIndexRows.length, totalSize }] };
            }
            if (/SELECT path, size, uploaded_at, updated_at FROM file_index ORDER BY uploaded_at DESC/i.test(sql)) {
              return { results: [...fileIndexRows].sort((a, b) => b.uploaded_at - a.uploaded_at) };
            }
            if (/SELECT \* FROM file_index ORDER BY uploaded_at DESC/i.test(sql)) {
              return { results: [...fileIndexRows].sort((a, b) => b.uploaded_at - a.uploaded_at) };
            }
            if (/SELECT path, salt, password_hash, note, show_name, created_at FROM path_passwords/i.test(sql)) {
              return { results: [...protectedRows].sort((a, b) => a.path.localeCompare(b.path)) };
            }
            if (/SELECT \* FROM trash ORDER BY trashed_at DESC/i.test(sql)) {
              const size = statement.bound?.[0] ?? 20;
              const offset = statement.bound?.[1] ?? 0;
              return { results: [...trashRows].sort((a, b) => b.trashed_at - a.trashed_at).slice(offset, offset + size) };
            }
            if (/SELECT \* FROM trash WHERE trashed_at < \? ORDER BY trashed_at DESC/i.test(sql)) {
              const cutoff = statement.bound?.[0] ?? 0;
              return { results: trashRows.filter(row => row.trashed_at < cutoff).sort((a, b) => b.trashed_at - a.trashed_at) };
            }
            if (/SELECT \* FROM trash WHERE/i.test(sql)) {
              const bound = statement.bound || [];
              const size = bound[bound.length - 2] ?? 20;
              const offset = bound[bound.length - 1] ?? 0;
              return { results: filteredTrashRows(bound.slice(0, -2)).sort((a, b) => b.trashed_at - a.trashed_at).slice(offset, offset + size) };
            }
            if (/SELECT \* FROM trash\s+ORDER BY trashed_at DESC/i.test(sql)) {
              return { results: [...trashRows].sort((a, b) => b.trashed_at - a.trashed_at) };
            }
            if (/SELECT \* FROM logs ORDER BY timestamp DESC/i.test(sql)) {
              return { results: logs.map((log, i) => ({ ...log, timestamp: new Date(Date.now() - i * 1000).toISOString() })) };
            }
            return { results: [] };
          },
        };
        return statement;
      },
    },
  };
}

test('list files filters empty root folders and hidden paths for guests', async () => {
  const env = makeEnv({
    prefixes: ['/', 'public/', 'secret/'],
    objects: [
      { key: 'readme.txt', size: 5, uploaded: new Date('2026-01-01') },
      { key: '.folder', size: 0, uploaded: new Date('2026-01-01') },
    ],
  });

  const res = await handleListFiles(env, new Request('https://example.com/api/files'), ['secret'], { role: 'guest' }, '');
  const data = await res.json();

  assert.deepEqual(data.folders.map(f => f.fullKey), ['public']);
  assert.deepEqual(data.files.map(f => f.fullKey), ['readme.txt']);
});

test('reserved storage prefixes are hidden from normal file listings', async () => {
  const env = makeEnv({
    prefixes: ['public/', '.trash/', '.thumbs/', '.meta/'],
    objects: [
      { key: 'public/readme.txt', size: 5, uploaded: new Date('2026-01-01') },
      { key: '.trash/trash-1/secret.txt', size: 6, uploaded: new Date('2026-01-01') },
      { key: '.thumbs/public/readme.png', size: 6, uploaded: new Date('2026-01-01') },
      { key: '.meta/index.json', size: 6, uploaded: new Date('2026-01-01') },
    ],
  });

  const guestRes = await handleListFiles(env, new Request('https://example.com/api/files'), [], { role: 'guest' }, '');
  const guestData = await guestRes.json();
  assert.deepEqual(guestData.folders.map(f => f.fullKey), ['public']);
  assert.deepEqual(guestData.files.map(f => f.fullKey), []);

  const adminRes = await handleListFiles(env, new Request('https://example.com/api/files'), [], { role: 'admin' }, '');
  const adminData = await adminRes.json();
  assert.deepEqual(adminData.folders.map(f => f.fullKey), ['public']);
});

test('search reads paginated R2 listings', async () => {
  const env = makeEnv({
    listPageSize: 1,
    objects: [
      { key: 'docs/first.txt', size: 5, uploaded: new Date('2026-01-01') },
      { key: 'docs/second.txt', size: 6, uploaded: new Date('2026-01-01') },
      { key: 'docs/third.md', size: 7, uploaded: new Date('2026-01-01') },
    ],
  });

  const res = await handleSearch(env, new Request('https://example.com/api/search?q=.txt&scope=/docs'), new URL('https://example.com/api/search?q=.txt&scope=/docs'), [], { role: 'guest' }, []);
  const data = await res.json();

  assert.deepEqual(data.files.map(file => file.fullKey), ['docs/first.txt', 'docs/second.txt']);
});

test('search returns cursor for loading more results', async () => {
  const env = makeEnv({
    listPageSize: 1,
    objects: [
      { key: 'docs/first.txt', size: 5, uploaded: new Date('2026-01-01') },
      { key: 'docs/second.txt', size: 6, uploaded: new Date('2026-01-01') },
    ],
  });

  const first = await handleSearch(env, new Request('https://example.com/api/search?q=.txt&scope=/docs&limit=1'), new URL('https://example.com/api/search?q=.txt&scope=/docs&limit=1'), [], { role: 'guest' }, []);
  const firstData = await first.json();
  assert.deepEqual(firstData.files.map(file => file.fullKey), ['docs/first.txt']);
  assert.equal(firstData.nextCursor, '1');

  const second = await handleSearch(env, new Request('https://example.com/api/search?q=.txt&scope=/docs&limit=1&cursor=1'), new URL('https://example.com/api/search?q=.txt&scope=/docs&limit=1&cursor=1'), [], { role: 'guest' }, []);
  const secondData = await second.json();
  assert.deepEqual(secondData.files.map(file => file.fullKey), ['docs/second.txt']);
  assert.equal(secondData.nextCursor, '');
});

test('search stops at scan limit and returns cursor for continuing sparse matches', async () => {
  const env = makeEnv({
    listPageSize: 1,
    objects: [
      { key: 'docs/first.txt', size: 5, uploaded: new Date('2026-01-01') },
      { key: 'docs/target.txt', size: 6, uploaded: new Date('2026-01-01') },
    ],
  });

  const first = await handleSearch(env, new Request('https://example.com/api/search?q=target&scope=/docs&limit=1&scanLimit=1'), new URL('https://example.com/api/search?q=target&scope=/docs&limit=1&scanLimit=1'), [], { role: 'guest' }, []);
  const firstData = await first.json();
  assert.deepEqual(firstData.files, []);
  assert.equal(firstData.nextCursor, '1');
  assert.equal(firstData.scanLimitReached, true);

  const second = await handleSearch(env, new Request('https://example.com/api/search?q=target&scope=/docs&limit=1&scanLimit=1&cursor=1'), new URL('https://example.com/api/search?q=target&scope=/docs&limit=1&scanLimit=1&cursor=1'), [], { role: 'guest' }, []);
  const secondData = await second.json();
  assert.deepEqual(secondData.files.map(file => file.fullKey), ['docs/target.txt']);
  assert.equal(secondData.nextCursor, '');
});

test('search uses D1 file index when available', async () => {
  const env = makeEnv();
  await upsertFileIndex(env, 'docs/indexed-alpha.txt', { size: 12, contentType: 'text/plain', uploaded: new Date('2026-01-04') });
  await upsertFileIndex(env, 'docs/other.md', { size: 8, contentType: 'text/markdown', uploaded: new Date('2026-01-03') });

  assert.equal(await indexedFileCount(env), 2);

  const res = await handleSearch(env, new Request('https://example.com/api/search?q=alpha&scope=/docs'), new URL('https://example.com/api/search?q=alpha&scope=/docs'), [], { role: 'guest' }, []);
  const data = await res.json();

  assert.deepEqual(data.files.map(file => file.fullKey), ['docs/indexed-alpha.txt']);
  assert.equal(data.scanLimitReached, false);
});

test('preview response streams existing object, supports range, and 404s missing object', async () => {
  const env = makeEnv({
    objects: [{ key: 'docs/readme.txt', body: 'hello', size: 5, uploaded: new Date('2026-01-01') }],
  });

  const ok = await handleDownloadOrPreview(env, new Request('https://example.com/api/preview/docs/readme.txt'), '/api/preview/docs/readme.txt', 'docs/readme.txt');
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('Content-Disposition'), 'inline');

  const ranged = await handleDownloadOrPreview(
    env,
    new Request('https://example.com/api/download/docs/readme.txt', { headers: { Range: 'bytes=1-3' } }),
    '/api/download/docs/readme.txt',
    'docs/readme.txt',
  );
  assert.equal(ranged.status, 206);
  assert.equal(ranged.headers.get('Content-Range'), 'bytes 1-3/5');

  const missing = await handleDownloadOrPreview(env, new Request('https://example.com/api/preview/missing.txt'), '/api/preview/missing.txt', 'missing.txt');
  assert.equal(missing.status, 404);
});

test('request context extracts encoded R2 keys and guards hidden paths', () => {
  assert.equal(getR2KeyFromPath('/api/preview/%E8%B5%A4%E5%A3%81%E8%B5%8B.txt'), '赤壁赋.txt');
  assert.equal(canReadKey({ role: 'guest' }, 'secret/a.txt', ['secret']), false);
  assert.equal(canReadKey({ role: 'admin' }, 'secret/a.txt', ['secret']), true);
  assert.equal(canReadKey({ role: 'guest' }, '.trash/id/readme.txt', []), false);
  assert.equal(canReadKey({ role: 'admin' }, '.trash/id/readme.txt', []), true);
  assert.equal(canReadKey({ role: 'guest' }, '.thumbs/readme.png', []), false);
});

test('admin login issues csrf token and write requests must echo it', async () => {
  const env = makeEnv();
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'pass';

  const login = await handleLogin(new Request('https://example.com/api/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: 'pass' }),
    headers: { 'Content-Type': 'application/json' },
  }), env);
  const loginData = await login.json();
  const cookie = login.headers.get('Set-Cookie');
  assert.equal(loginData.success, true);
  assert.ok(loginData.csrf);
  assert.ok(cookie?.includes('token='));

  const auth = await verifyAuth(new Request('https://example.com/api/auth/role', {
    headers: { Cookie: cookie },
  }), env);
  assert.equal(auth.role, 'admin');
  assert.equal(auth.csrf, loginData.csrf);
  assert.equal(verifyCsrf(new Request('https://example.com/api/batch-delete', {
    method: 'POST',
    headers: { Cookie: cookie, 'X-CSRF-Token': loginData.csrf },
  }), auth), true);
  assert.equal(verifyCsrf(new Request('https://example.com/api/batch-delete', {
    method: 'POST',
    headers: { Cookie: cookie, 'X-CSRF-Token': 'bad' },
  }), auth), false);
});

test('admin login locks after repeated failed attempts and clears after success', async () => {
  const env = makeEnv();
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'pass';

  for (let i = 0; i < 5; i++) {
    const failed = await handleLogin(new Request('https://example.com/api/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: 'bad' }),
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.50' },
    }), env);
    assert.equal(failed.status, 401);
  }

  const locked = await handleLogin(new Request('https://example.com/api/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: 'pass' }),
    headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.50' },
  }), env);
  assert.equal(locked.status, 429);

  const otherIpSuccess = await handleLogin(new Request('https://example.com/api/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: 'pass' }),
    headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.51' },
  }), env);
  assert.equal(otherIpSuccess.status, 200);

  const oneWrong = await handleLogin(new Request('https://example.com/api/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: 'bad' }),
    headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.52' },
  }), env);
  assert.equal(oneWrong.status, 401);
  const clearsOnSuccess = await handleLogin(new Request('https://example.com/api/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: 'pass' }),
    headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.52' },
  }), env);
  assert.equal(clearsOnSuccess.status, 200);
  for (let i = 0; i < 4; i++) {
    const failed = await handleLogin(new Request('https://example.com/api/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: 'bad' }),
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.52' },
    }), env);
    assert.equal(failed.status, 401);
  }
});

test('guest access is disabled unless ALLOW_GUEST is true', async () => {
  const closedEnv = makeEnv();
  assert.equal(await verifyAuth(new Request('https://example.com/api/auth/role'), closedEnv), null);

  const openEnv = makeEnv();
  openEnv.ALLOW_GUEST = 'true';
  assert.deepEqual(await verifyAuth(new Request('https://example.com/api/auth/role'), openEnv), { role: 'guest' });
});

test('route smoke: admin can login, upload, list, and search', async () => {
  const env = makeEnv();
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'admin-secret';

  const login = await onRequest({
    env,
    request: new Request('https://example.com/api/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: 'admin-secret' }),
      headers: { 'Content-Type': 'application/json' },
    }),
  });
  const loginData = await login.json();
  const cookie = login.headers.get('Set-Cookie');
  assert.equal(loginData.success, true);
  assert.ok(cookie);

  const form = new FormData();
  form.append('file', new File(['hello'], 'route-smoke.txt', { type: 'text/plain' }));
  const upload = await onRequest({
    env,
    request: new Request('https://example.com/api/files', {
      method: 'POST',
      body: form,
      headers: { Cookie: cookie, 'X-CSRF-Token': loginData.csrf },
    }),
  });
  assert.equal(upload.status, 200);

  const listed = await onRequest({
    env,
    request: new Request('https://example.com/api/files', {
      headers: { Cookie: cookie },
    }),
  });
  const listData = await listed.json();
  assert.deepEqual(listData.files.map(file => file.fullKey), ['route-smoke.txt']);

  const search = await onRequest({
    env,
    request: new Request('https://example.com/api/search?q=route&scope=/', {
      headers: { Cookie: cookie },
    }),
  });
  const searchData = await search.json();
  assert.deepEqual(searchData.files.map(file => file.fullKey), ['route-smoke.txt']);
});

test('route smoke: folder upload can target nested paths', async () => {
  const env = makeEnv();
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'admin-secret';

  const login = await onRequest({
    env,
    request: new Request('https://example.com/api/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: 'admin-secret' }),
      headers: { 'Content-Type': 'application/json' },
    }),
  });
  const loginData = await login.json();
  const cookie = login.headers.get('Set-Cookie');

  const form = new FormData();
  form.append('file', new File(['nested'], 'inside.txt', { type: 'text/plain' }));
  const upload = await onRequest({
    env,
    request: new Request('https://example.com/api/files/projects/folder-a', {
      method: 'POST',
      body: form,
      headers: { Cookie: cookie, 'X-CSRF-Token': loginData.csrf },
    }),
  });

  assert.equal(upload.status, 200);
  assert.ok(await env.R2.get('projects/folder-a/inside.txt'));
});

test('protected paths require password and unlock with signed cookie', async () => {
  const env = makeEnv({
    prefixes: ['public/', 'private/'],
    objects: [
      { key: 'private/secret.txt', body: 'secret', size: 6, uploaded: new Date('2026-01-01') },
    ],
  });
  env.ADMIN_PASSWORD = 'pass';

  const create = await handleProtectedSettings(env, new Request('https://example.com/api/admin/settings/protected', {
    method: 'POST',
    body: JSON.stringify({ path: '/private', password: '12345678', note: 'test', showName: true }),
    headers: { 'Content-Type': 'application/json' },
  }), 'POST', new URL('https://example.com/api/admin/settings/protected'));
  assert.equal((await create.json()).success, true);

  const rules = await loadProtectedPaths(env);
  const root = await handleListFiles(env, new Request('https://example.com/api/files'), [], { role: 'guest' }, '', rules);
  const rootData = await root.json();
  assert.equal(rootData.folders.find(f => f.fullKey === 'private')?.protected, true);

  const blocked = await handleListFiles(env, new Request('https://example.com/api/files/private'), [], { role: 'guest' }, 'private', rules);
  assert.equal(blocked.status, 403);
  assert.equal((await blocked.json()).code, 'password_required');

  const unlock = await handleProtectedUnlock(env, new Request('https://example.com/api/access/unlock', {
    method: 'POST',
    body: JSON.stringify({ path: '/private', password: '12345678' }),
    headers: { 'Content-Type': 'application/json' },
  }), { role: 'guest' }, rules);
  assert.equal((await unlock.json()).success, true);
  const cookie = unlock.headers.get('Set-Cookie');
  assert.ok(cookie?.includes('path_access='));

  const access = await checkProtectedAccess(new Request('https://example.com/api/files/private', {
    headers: { Cookie: cookie },
  }), env, { role: 'guest' }, rules, 'private/secret.txt');
  assert.equal(access.ok, true);
});

test('protected path passwords reject very short secrets and store pbkdf2 hashes', async () => {
  const env = makeEnv();
  env.ADMIN_PASSWORD = 'admin-secret';

  const short = await handleProtectedSettings(env, new Request('https://example.com/api/admin/settings/protected', {
    method: 'POST',
    body: JSON.stringify({ path: '/private', password: '123' }),
    headers: { 'Content-Type': 'application/json' },
  }), 'POST', new URL('https://example.com/api/admin/settings/protected'));
  assert.equal(short.status, 400);

  const create = await handleProtectedSettings(env, new Request('https://example.com/api/admin/settings/protected', {
    method: 'POST',
    body: JSON.stringify({ path: '/private', password: '12345678' }),
    headers: { 'Content-Type': 'application/json' },
  }), 'POST', new URL('https://example.com/api/admin/settings/protected'));
  assert.equal(create.status, 200);

  const rows = await loadProtectedPaths(env);
  assert.match(rows[0].password_hash, /^pbkdf2-sha256\$/);
});

test('protected path unlock locks after repeated wrong passwords and clears on success', async () => {
  const env = makeEnv();
  env.ADMIN_PASSWORD = 'admin-secret';

  await handleProtectedSettings(env, new Request('https://example.com/api/admin/settings/protected', {
    method: 'POST',
    body: JSON.stringify({ path: '/private', password: '1234' }),
    headers: { 'Content-Type': 'application/json' },
  }), 'POST', new URL('https://example.com/api/admin/settings/protected'));
  const rules = await loadProtectedPaths(env);

  for (let i = 0; i < 5; i++) {
    const wrong = await handleProtectedUnlock(env, new Request('https://example.com/api/access/unlock', {
      method: 'POST',
      body: JSON.stringify({ path: '/private', password: 'bad' }),
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.10' },
    }), { role: 'guest' }, rules);
    assert.equal(wrong.status, 403);
  }

  const locked = await handleProtectedUnlock(env, new Request('https://example.com/api/access/unlock', {
    method: 'POST',
    body: JSON.stringify({ path: '/private', password: '1234' }),
    headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.10' },
  }), { role: 'guest' }, rules);
  assert.equal(locked.status, 429);
  assert.ok(Number(locked.headers.get('Retry-After')) > 0);

  const otherIp = await handleProtectedUnlock(env, new Request('https://example.com/api/access/unlock', {
    method: 'POST',
    body: JSON.stringify({ path: '/private', password: '1234' }),
    headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.11' },
  }), { role: 'guest' }, rules);
  assert.equal(otherIp.status, 200);

  const failThenSuccessIp = '203.0.113.12';
  const oneWrong = await handleProtectedUnlock(env, new Request('https://example.com/api/access/unlock', {
    method: 'POST',
    body: JSON.stringify({ path: '/private', password: 'bad' }),
    headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': failThenSuccessIp },
  }), { role: 'guest' }, rules);
  assert.equal(oneWrong.status, 403);
  const success = await handleProtectedUnlock(env, new Request('https://example.com/api/access/unlock', {
    method: 'POST',
    body: JSON.stringify({ path: '/private', password: '1234' }),
    headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': failThenSuccessIp },
  }), { role: 'guest' }, rules);
  assert.equal(success.status, 200);
});

test('frontend file path helpers encode each path segment', () => {
  assert.equal(encodeR2Path('/中文/赤壁赋.txt'), '%E4%B8%AD%E6%96%87/%E8%B5%A4%E5%A3%81%E8%B5%8B.txt');
  assert.equal(apiFileUrl('/api/preview', '/中文/赤壁赋.txt'), '/api/preview/%E4%B8%AD%E6%96%87/%E8%B5%A4%E5%A3%81%E8%B5%8B.txt');
});

test('thumbnail endpoint only accepts image files', async () => {
  const env = makeEnv({
    objects: [{ key: 'docs/readme.txt', body: 'hello', size: 5, uploaded: new Date('2026-01-01') }],
  });

  const res = await handleThumbnail(env, new Request('https://example.com/api/thumbnail/docs/readme.txt'), 'docs/readme.txt', {});
  assert.equal(res.status, 415);
});

test('multipart upload lifecycle returns upload id, parts, complete and abort', async () => {
  const env = makeEnv();
  const create = await handleMultipartCreate(env, new Request('https://example.com', {
    method: 'POST',
    body: JSON.stringify({ targetDir: '/', name: 'large.bin', type: 'application/octet-stream' }),
    headers: { 'Content-Type': 'application/json' },
  }));
  const created = await create.json();
  assert.equal(created.key, 'large.bin');
  assert.equal(created.uploadId, 'upload-1');

  const part = await handleMultipartPart(env, new Request('https://example.com/api/upload-multipart/part?key=large.bin&uploadId=upload-1&partNumber=1', {
    method: 'PUT',
    body: 'chunk',
  }), new URL('https://example.com/api/upload-multipart/part?key=large.bin&uploadId=upload-1&partNumber=1'));
  assert.deepEqual(await part.json(), { partNumber: 1, etag: 'etag-1' });

  const complete = await handleMultipartComplete(env, new Request('https://example.com', {
    method: 'POST',
    body: JSON.stringify({ key: 'large.bin', uploadId: 'upload-1', parts: [{ partNumber: 1, etag: 'etag-1' }] }),
    headers: { 'Content-Type': 'application/json' },
  }));
  assert.equal((await complete.json()).success, true);

  const abort = await handleMultipartAbort(env, new Request('https://example.com', {
    method: 'POST',
    body: JSON.stringify({ key: 'large.bin', uploadId: 'upload-1' }),
    headers: { 'Content-Type': 'application/json' },
  }));
  assert.equal((await abort.json()).success, true);
});

test('multipart upload logs only final user-visible events', async () => {
  const env = makeEnv();
  const create = await handleMultipartCreate(env, new Request('https://example.com', {
    method: 'POST',
    body: JSON.stringify({ targetDir: '/', name: 'large.bin', type: 'application/octet-stream' }),
    headers: { 'Content-Type': 'application/json' },
  }));
  assert.equal(create.status, 200);

  let logs = await env.D1.prepare('SELECT * FROM logs ORDER BY timestamp DESC').all();
  assert.deepEqual(logs.results || [], []);

  await handleMultipartComplete(env, new Request('https://example.com', {
    method: 'POST',
    body: JSON.stringify({ key: 'large.bin', uploadId: 'upload-1', parts: [{ partNumber: 1, etag: 'etag-1' }] }),
    headers: { 'Content-Type': 'application/json' },
  }));
  logs = await env.D1.prepare('SELECT * FROM logs ORDER BY timestamp DESC').all();
  assert.deepEqual((logs.results || []).map(log => log.action), ['UPLOAD']);
});

test('user writes cannot target reserved system prefixes', async () => {
  const env = makeEnv();
  await assert.rejects(
    () => handleMultipartCreate(env, new Request('https://example.com', {
      method: 'POST',
      body: JSON.stringify({ targetDir: '/', name: '.trash', type: 'application/octet-stream' }),
      headers: { 'Content-Type': 'application/json' },
    })),
    /Reserved system path/,
  );
});

test('batch delete moves files into trash and restore returns them', async () => {
  const env = makeEnv({
    objects: [
      { key: 'docs/readme.txt', body: 'hello', size: 5, uploaded: new Date('2026-01-01') },
    ],
  });

  const batchDelete = await (await import('../functions/api/lib/file-mutations.js')).handleBatchDelete(env, new Request('https://example.com', {
    method: 'POST',
    body: JSON.stringify({ paths: ['docs/readme.txt'] }),
    headers: { 'Content-Type': 'application/json' },
  }));
  assert.equal((await batchDelete.json()).success, true);

  const trashList = await handleTrashList(env, new URL('https://example.com/api/trash?page=1&size=20'));
  const trashData = await trashList.json();
  assert.equal(trashData.items.length, 1);

  const id = trashData.items[0].id;
  const restore = await handleTrashRestore(env, new Request('https://example.com', {
    method: 'POST',
    body: JSON.stringify({ id }),
    headers: { 'Content-Type': 'application/json' },
  }));
  assert.equal((await restore.json()).success, true);
  assert.ok(await env.R2.get('docs/readme.txt'));

  const trashDelete = await handleTrashDelete(env, new Request('https://example.com', {
    method: 'DELETE',
    body: JSON.stringify({ id }),
    headers: { 'Content-Type': 'application/json' },
  }));
  assert.equal(trashDelete.status, 404);
});

test('batch delete reports partial failures', async () => {
  const env = makeEnv({
    objects: [
      { key: 'docs/readme.txt', body: 'hello', size: 5, uploaded: new Date('2026-01-01') },
    ],
  });

  const res = await (await import('../functions/api/lib/file-mutations.js')).handleBatchDelete(env, new Request('https://example.com', {
    method: 'POST',
    body: JSON.stringify({ paths: ['docs/readme.txt', 'docs/missing.txt'] }),
    headers: { 'Content-Type': 'application/json' },
  }));
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.success, false);
  assert.equal(data.completed, 1);
  assert.equal(data.failed.length, 1);
});

test('batch delete reports oversized folders instead of silently truncating', async () => {
  const objects = Array.from({ length: 10001 }, (_, index) => ({
    key: `docs/file-${index}.txt`,
    body: 'x',
    size: 1,
    uploaded: new Date('2026-01-01'),
  }));
  const env = makeEnv({ objects, listPageSize: 10000 });

  const res = await (await import('../functions/api/lib/file-mutations.js')).handleBatchDelete(env, new Request('https://example.com', {
    method: 'POST',
    body: JSON.stringify({ paths: ['docs'] }),
    headers: { 'Content-Type': 'application/json' },
  }));
  const data = await res.json();
  assert.equal(res.status, 400);
  assert.equal(data.success, false);
  assert.match(data.failed[0].message, /too large/);
});

test('rename refuses to overwrite existing targets', async () => {
  const env = makeEnv({
    objects: [
      { key: 'docs/a.txt', body: 'a', size: 1, uploaded: new Date('2026-01-01') },
      { key: 'docs/b.txt', body: 'b', size: 1, uploaded: new Date('2026-01-01') },
    ],
  });

  await assert.rejects(
    () => handleRename(env, new Request('https://example.com', {
      method: 'PUT',
      body: JSON.stringify({ newName: 'b.txt' }),
      headers: { 'Content-Type': 'application/json' },
    }), 'docs/a.txt'),
    /Target already exists/,
  );
});

test('copy and move operations keep file index in sync', async () => {
  const env = makeEnv({
    objects: [
      { key: 'docs/a.txt', body: 'a', size: 1, uploaded: new Date('2026-01-01') },
      { key: 'docs/nested/b.txt', body: 'bb', size: 2, uploaded: new Date('2026-01-02') },
    ],
  });
  await upsertFileIndex(env, 'docs/a.txt', { size: 1, contentType: 'text/plain', uploaded: new Date('2026-01-01') });
  await upsertFileIndex(env, 'docs/nested/b.txt', { size: 2, contentType: 'text/plain', uploaded: new Date('2026-01-02') });

  const copy = await handlePaste(env, new Request('https://example.com', {
    method: 'POST',
    body: JSON.stringify({ action: 'copy', paths: ['docs/a.txt'], targetDir: '/copies' }),
    headers: { 'Content-Type': 'application/json' },
  }));
  assert.equal((await copy.json()).success, true);
  let search = await handleSearch(env, new Request('https://example.com/api/search?q=a.txt&scope=/copies'), new URL('https://example.com/api/search?q=a.txt&scope=/copies'), [], { role: 'guest' }, []);
  assert.deepEqual((await search.json()).files.map(file => file.fullKey), ['copies/a.txt']);

  const move = await handlePaste(env, new Request('https://example.com', {
    method: 'POST',
    body: JSON.stringify({ action: 'move', paths: ['docs/nested'], targetDir: '/moved' }),
    headers: { 'Content-Type': 'application/json' },
  }));
  assert.equal((await move.json()).success, true);
  search = await handleSearch(env, new Request('https://example.com/api/search?q=b.txt&scope=/moved'), new URL('https://example.com/api/search?q=b.txt&scope=/moved'), [], { role: 'guest' }, []);
  assert.deepEqual((await search.json()).files.map(file => file.fullKey), ['moved/nested/b.txt']);
  search = await handleSearch(env, new Request('https://example.com/api/search?q=b.txt&scope=/docs'), new URL('https://example.com/api/search?q=b.txt&scope=/docs'), [], { role: 'guest' }, []);
  assert.deepEqual((await search.json()).files.map(file => file.fullKey), []);
});

test('trash items can be purged permanently', async () => {
  const env = makeEnv({
    objects: [
      { key: 'docs/temp.txt', body: 'bye', size: 3, uploaded: new Date('2026-01-01') },
    ],
  });

  await (await import('../functions/api/lib/file-mutations.js')).handleBatchDelete(env, new Request('https://example.com', {
    method: 'POST',
    body: JSON.stringify({ paths: ['docs/temp.txt'] }),
    headers: { 'Content-Type': 'application/json' },
  }));

  const trashList = await handleTrashList(env, new URL('https://example.com/api/trash?page=1&size=20'));
  const trashData = await trashList.json();
  const id = trashData.items[0].id;

  const purge = await handleTrashDelete(env, new Request('https://example.com', {
    method: 'DELETE',
    body: JSON.stringify({ id }),
    headers: { 'Content-Type': 'application/json' },
  }));
  assert.equal((await purge.json()).success, true);
  assert.equal((await handleTrashList(env, new URL('https://example.com/api/trash?page=1&size=20'))).status, 200);
  assert.equal(await env.R2.get('docs/temp.txt'), null);
});

test('trash list can filter by path, kind, and trashed date', async () => {
  const env = makeEnv({
    objects: [
      { key: 'docs/alpha.txt', body: 'a', size: 1, uploaded: new Date('2026-01-01') },
      { key: 'photos/beta.jpg', body: 'b', size: 1, uploaded: new Date('2026-01-01') },
    ],
  });

  const realNow = Date.now;
  Date.now = () => new Date('2026-02-01T00:00:00Z').getTime();
  await (await import('../functions/api/lib/file-mutations.js')).handleBatchDelete(env, new Request('https://example.com', {
    method: 'POST',
    body: JSON.stringify({ paths: ['docs/alpha.txt'] }),
    headers: { 'Content-Type': 'application/json' },
  }));
  Date.now = () => new Date('2026-03-01T00:00:00Z').getTime();
  await (await import('../functions/api/lib/file-mutations.js')).handleBatchDelete(env, new Request('https://example.com', {
    method: 'POST',
    body: JSON.stringify({ paths: ['photos/beta.jpg'] }),
    headers: { 'Content-Type': 'application/json' },
  }));
  Date.now = realNow;

  const byQuery = await handleTrashList(env, new URL('https://example.com/api/trash?q=alpha&page=1&size=20'));
  assert.deepEqual((await byQuery.json()).items.map(item => item.original_key), ['docs/alpha.txt']);

  const from = new Date('2026-02-15T00:00:00Z').getTime();
  const byDate = await handleTrashList(env, new URL(`https://example.com/api/trash?kind=file&from=${from}&page=1&size=20`));
  assert.deepEqual((await byDate.json()).items.map(item => item.original_key), ['photos/beta.jpg']);
});

test('file view model orders entries and exposes selectable keys', () => {
  const fileData = {
    folders: [{ name: 'b', fullKey: 'b' }, { name: 'a', fullKey: 'a' }],
    files: [
      { name: 'small.txt', fullKey: 'small.txt', rawSize: 1, time: 1 },
      { name: 'large.txt', fullKey: 'large.txt', rawSize: 10, time: 2 },
    ],
  };

  assert.deepEqual(getOrderedEntries(fileData, 'size').map(i => i.fullKey), ['a', 'b', 'large.txt', 'small.txt']);
  assert.deepEqual(getSelectableKeys(fileData), ['a', 'b', 'large.txt', 'small.txt']);
});

test('multipart uploads can resolve name conflicts', async () => {
  const env = makeEnv({
    objects: [{ key: 'docs/report.pdf', body: 'old', size: 3, uploaded: new Date('2026-01-01') }],
  });

  const renamed = await handleMultipartCreate(env, new Request('https://example.com', {
    method: 'POST',
    body: JSON.stringify({ targetDir: '/docs', name: 'report.pdf', type: 'application/pdf', conflict: 'rename' }),
    headers: { 'Content-Type': 'application/json' },
  }));
  const renamedData = await renamed.json();
  assert.equal(renamedData.key, 'docs/report (1).pdf');
  assert.equal(renamedData.renamed, true);

  const skipped = await handleMultipartCreate(env, new Request('https://example.com', {
    method: 'POST',
    body: JSON.stringify({ targetDir: '/docs', name: 'report.pdf', type: 'application/pdf', conflict: 'skip' }),
    headers: { 'Content-Type': 'application/json' },
  }));
  assert.equal((await skipped.json()).skipped, true);
});

test('quota check syncs empty file index from R2 before accepting uploads', async () => {
  const env = makeEnv({
    objects: [{ key: 'existing.bin', body: '1234567890', size: 10, uploaded: new Date('2026-01-01') }],
  });
  await setStorageQuotaForTest(env.D1, 12);
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'admin-secret';

  const login = await onRequest({
    env,
    request: new Request('https://example.com/api/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: 'admin-secret' }),
      headers: { 'Content-Type': 'application/json' },
    }),
  });
  const loginData = await login.json();
  const cookie = login.headers.get('Set-Cookie');

  const form = new FormData();
  form.append('file', new File(['abcde'], 'new.bin', { type: 'application/octet-stream' }));
  const upload = await onRequest({
    env,
    request: new Request('https://example.com/api/files', {
      method: 'POST',
      body: form,
      headers: { Cookie: cookie, 'X-CSRF-Token': loginData.csrf },
    }),
  });

  assert.equal(upload.status, 507);
  assert.equal(await indexedFileCount(env), 1);
});

test('admin stats summarize visible stored files', async () => {
  const env = makeEnv({
    objects: [
      { key: 'photos/a.jpg', body: 'image', size: 5, uploaded: new Date('2026-01-03') },
      { key: 'docs/readme.md', body: 'text', size: 4, uploaded: new Date('2026-01-02') },
      { key: '.trash/old/readme.md', body: 'old', size: 3, uploaded: new Date('2026-01-01') },
    ],
  });

  const res = await handleAdminStats(env);
  const data = await res.json();
  assert.equal(data.files.count, 2);
  assert.equal(data.files.totalSize, 9);
  assert.equal(data.breakdown.image.count, 1);
  assert.equal(data.breakdown.text.count, 1);
  assert.deepEqual(data.latest.map(item => item.key), ['photos/a.jpg', 'docs/readme.md']);
});

test('admin stats can summarize from file index', async () => {
  const env = makeEnv();
  await upsertFileIndex(env, 'photos/a.jpg', { size: 5, contentType: 'image/jpeg', uploaded: new Date('2026-01-03') });
  await upsertFileIndex(env, 'docs/readme.md', { size: 4, contentType: 'text/markdown', uploaded: new Date('2026-01-02') });

  const res = await handleAdminStats(env);
  const data = await res.json();

  assert.equal(data.files.count, 2);
  assert.equal(data.files.totalSize, 9);
  assert.equal(data.breakdown.image.count, 1);
  assert.equal(data.breakdown.text.count, 1);
  assert.deepEqual(data.latest.map(item => item.key), ['photos/a.jpg', 'docs/readme.md']);
});

test('admin maintenance reports counts and runs cleanup actions', async () => {
  const env = makeEnv({
    objects: [
      { key: 'docs/a.txt', body: 'a', size: 1, uploaded: new Date('2026-01-02') },
      { key: '.thumbs/docs/a.jpg', body: 'thumb', size: 5, uploaded: new Date('2026-01-02') },
    ],
  });
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'admin-secret';

  const login = await onRequest({
    env,
    request: new Request('https://example.com/api/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: 'admin-secret' }),
      headers: { 'Content-Type': 'application/json' },
    }),
  });
  const loginData = await login.json();
  const cookie = login.headers.get('Set-Cookie');

  const rebuild = await onRequest({
    env,
    request: new Request('https://example.com/api/admin/maintenance', {
      method: 'POST',
      body: JSON.stringify({ action: 'rebuild-index' }),
      headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': loginData.csrf },
    }),
  });
  const rebuildData = await rebuild.json();
  assert.equal(rebuild.status, 200);
  assert.equal(rebuildData.synced, 1);
  assert.equal(await indexedFileCount(env), 1);

  const cleanupThumbs = await onRequest({
    env,
    request: new Request('https://example.com/api/admin/maintenance', {
      method: 'POST',
      body: JSON.stringify({ action: 'cleanup-thumbnails' }),
      headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': loginData.csrf },
    }),
  });
  assert.equal((await cleanupThumbs.json()).deleted, 1);
  assert.equal(await env.R2.get('.thumbs/docs/a.jpg'), null);

  const status = await onRequest({
    env,
    request: new Request('https://example.com/api/admin/maintenance', {
      headers: { Cookie: cookie },
    }),
  });
  const statusData = await status.json();
  assert.equal(statusData.indexCount, 1);
  assert.equal(statusData.thumbnailsPresent, false);
});

test('webhook settings saved in D1 are used for file operation notifications', async () => {
  const env = makeEnv();
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'admin-secret';
  const calls = [];
  const waitUntilPromises = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response('ok', { status: 200 });
  };

  try {
    const login = await onRequest({
      env,
      request: new Request('https://example.com/api/login', {
        method: 'POST',
        body: JSON.stringify({ username: 'admin', password: 'admin-secret' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    });
    const loginData = await login.json();
    const cookie = login.headers.get('Set-Cookie');

    const save = await onRequest({
      env,
      request: new Request('https://example.com/api/admin/settings/webhooks', {
        method: 'PUT',
        body: JSON.stringify({ items: [{ name: 'notify', url: 'https://hooks.example.test/notify' }] }),
        headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': loginData.csrf },
      }),
    });
    assert.equal(save.status, 200);

    const mkdir = await onRequest({
      env,
      request: new Request('https://example.com/api/mkdir', {
        method: 'POST',
        body: JSON.stringify({ folderName: 'docs' }),
        headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': loginData.csrf },
      }),
      waitUntil(promise) {
        waitUntilPromises.push(promise);
      },
    });
    assert.equal(mkdir.status, 200);
    await Promise.all(waitUntilPromises);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://hooks.example.test/notify');
    assert.equal(calls[0].body.event, 'folder.created');
    assert.equal(calls[0].body.data.path, '/docs/');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('admin can send generic webhook test messages', async () => {
  const env = makeEnv();
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'admin-secret';
  const calls = [];
  const waitUntilPromises = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response('ok', { status: 200 });
  };

  try {
    const login = await onRequest({
      env,
      request: new Request('https://example.com/api/login', {
        method: 'POST',
        body: JSON.stringify({ username: 'admin', password: 'admin-secret' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    });
    const loginData = await login.json();
    const cookie = login.headers.get('Set-Cookie');

    const testSend = await onRequest({
      env,
      request: new Request('https://example.com/api/admin/settings/webhooks', {
        method: 'POST',
        body: JSON.stringify({ endpoint: { name: 'receiver', url: 'https://example.com/webhook', type: 'dingtalk', secret: 'SEC123' } }),
        headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': loginData.csrf },
      }),
    });
    assert.equal(testSend.status, 200);
    assert.equal(calls[0].url, 'https://example.com/webhook');
    assert.equal(calls[0].body.event, 'webhook.test');
    assert.match(calls[0].body.data.message, /O-Drive/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('webhook msgtype supports text and markdown payloads', async () => {
  const env = makeEnv();
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'admin-secret';
  const calls = [];
  const waitUntilPromises = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response('ok', { status: 200 });
  };

  try {
    const login = await onRequest({
      env,
      request: new Request('https://example.com/api/login', {
        method: 'POST',
        body: JSON.stringify({ username: 'admin', password: 'admin-secret' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    });
    const loginData = await login.json();
    const cookie = login.headers.get('Set-Cookie');

    const save = await onRequest({
      env,
      request: new Request('https://example.com/api/admin/settings/webhooks', {
        method: 'PUT',
        body: JSON.stringify({ items: [{ msgtype: 'text', url: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=abc' }] }),
        headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': loginData.csrf },
      }),
    });
    assert.equal(save.status, 200);

    const mkdir = await onRequest({
      env,
      request: new Request('https://example.com/api/mkdir', {
        method: 'POST',
        body: JSON.stringify({ folderName: 'wechat-docs' }),
        headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': loginData.csrf },
      }),
      waitUntil(promise) {
        waitUntilPromises.push(promise);
      },
    });
    assert.equal(mkdir.status, 200);
    await Promise.all(waitUntilPromises);

    assert.equal(calls[0].body.msgtype, 'text');
    assert.match(calls[0].body.text.content, /O-Drive 文件夹创建/);
    assert.match(calls[0].body.text.content, /wechat-docs/);

    const markdown = await onRequest({
      env,
      request: new Request('https://example.com/api/admin/settings/webhooks', {
        method: 'POST',
        body: JSON.stringify({ endpoint: { msgtype: 'markdown', url: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=abc' } }),
        headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': loginData.csrf },
      }),
    });
    assert.equal(markdown.status, 200);
    assert.equal(calls[1].body.msgtype, 'markdown');
    assert.match(calls[1].body.markdown.content, /O-Drive 测试通知/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('clearing webhook settings removes persisted endpoint data', async () => {
  const env = makeEnv();
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'admin-secret';

  const login = await onRequest({
    env,
    request: new Request('https://example.com/api/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: 'admin-secret' }),
      headers: { 'Content-Type': 'application/json' },
    }),
  });
  const loginData = await login.json();
  const cookie = login.headers.get('Set-Cookie');

  const save = await onRequest({
    env,
    request: new Request('https://example.com/api/admin/settings/webhooks', {
      method: 'PUT',
      body: JSON.stringify({ items: [{ type: 'dingtalk', url: 'https://oapi.dingtalk.com/robot/send?access_token=abc', secret: 'SEC123' }] }),
      headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': loginData.csrf },
    }),
  });
  assert.equal(save.status, 200);
  const savedData = await save.json();
  assert.equal(savedData.items.length, 1);
  assert.equal(savedData.items[0].msgtype, 'json');
  assert.equal(Object.prototype.hasOwnProperty.call(savedData.items[0], 'type'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(savedData.items[0], 'secret'), false);

  const legacyWecom = await onRequest({
    env,
    request: new Request('https://example.com/api/admin/settings/webhooks', {
      method: 'PUT',
      body: JSON.stringify({ items: [{ type: 'wechat_text', url: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=abc' }] }),
      headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': loginData.csrf },
    }),
  });
  const legacyData = await legacyWecom.json();
  assert.equal(legacyData.items[0].msgtype, 'text');

  const clear = await onRequest({
    env,
    request: new Request('https://example.com/api/admin/settings/webhooks', {
      method: 'PUT',
      body: JSON.stringify({ items: [] }),
      headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': loginData.csrf },
    }),
  });
  assert.equal(clear.status, 200);
  assert.deepEqual(await clear.json(), { success: true, items: [], urls: [] });

  const listed = await onRequest({
    env,
    request: new Request('https://example.com/api/admin/settings/webhooks', {
      headers: { Cookie: cookie },
    }),
  });
  assert.deepEqual(await listed.json(), { items: [], urls: [] });
});

test('admin health reports bindings and required env vars', async () => {
  const env = makeEnv();
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'pass';

  const res = await handleAdminHealth(env);
  const data = await res.json();

  assert.equal(data.ok, true);
  assert.equal(data.db.ok, true);
  assert.equal(data.r2.ok, true);
  assert.equal(data.env.adminUsername, true);
  assert.equal(data.env.adminPassword, true);
  assert.equal(data.env.guestEnabled, false);
});

test('operation estimate counts files inside selected folders', async () => {
  const env = makeEnv({
    objects: [
      { key: 'docs/.folder', body: '', size: 0, uploaded: new Date('2026-01-01') },
      { key: 'docs/a.txt', body: 'a', size: 1, uploaded: new Date('2026-01-01') },
      { key: 'docs/nested/b.txt', body: 'b', size: 1, uploaded: new Date('2026-01-01') },
      { key: 'single.txt', body: 's', size: 1, uploaded: new Date('2026-01-01') },
    ],
  });

  const res = await handleOperationEstimate(env, new Request('https://example.com', {
    method: 'POST',
    body: JSON.stringify({ paths: ['docs', 'single.txt'] }),
    headers: { 'Content-Type': 'application/json' },
  }));
  const data = await res.json();

  assert.equal(data.success, true);
  assert.equal(data.totalObjects, 4);
  assert.equal(data.items[0].kind, 'folder');
  assert.equal(data.items[0].objectCount, 3);
  assert.equal(data.items[1].kind, 'file');
  assert.equal(data.items[1].objectCount, 1);
});

test('trash can be cleared and cleanup respects retention setting', async () => {
  const env = makeEnv({
    objects: [
      { key: 'old.txt', body: 'old', size: 3, uploaded: new Date('2026-01-01') },
      { key: 'new.txt', body: 'new', size: 3, uploaded: new Date('2026-01-02') },
    ],
  });

  const realNow = Date.now;
  Date.now = () => realNow() - 10 * 24 * 60 * 60 * 1000;
  await (await import('../functions/api/lib/file-mutations.js')).handleBatchDelete(env, new Request('https://example.com', {
    method: 'POST',
    body: JSON.stringify({ paths: ['old.txt'] }),
    headers: { 'Content-Type': 'application/json' },
  }));
  Date.now = realNow;
  await (await import('../functions/api/lib/file-mutations.js')).handleBatchDelete(env, new Request('https://example.com', {
    method: 'POST',
    body: JSON.stringify({ paths: ['new.txt'] }),
    headers: { 'Content-Type': 'application/json' },
  }));

  const listed = await handleTrashList(env, new URL('https://example.com/api/trash?page=1&size=20'));
  const trashData = await listed.json();
  assert.equal(trashData.items.length, 2);

  await handleTrashRetention(env, new Request('https://example.com', {
    method: 'PUT',
    body: JSON.stringify({ days: 7 }),
    headers: { 'Content-Type': 'application/json' },
  }), 'PUT');
  const cleanup = await handleTrashCleanup(env, new Request('https://example.com', { method: 'POST' }));
  assert.equal((await cleanup.json()).deleted, 1);

  const clear = await handleTrashClear(env, new Request('https://example.com', { method: 'DELETE' }));
  assert.equal((await clear.json()).deleted, 1);
  const empty = await handleTrashList(env, new URL('https://example.com/api/trash?page=1&size=20'));
  assert.equal((await empty.json()).items.length, 0);
});
