import test from 'node:test';
import assert from 'node:assert/strict';

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
} from '../functions/api/lib/file-mutations.js';
import { handleAdminHealth, handleAdminStats } from '../functions/api/lib/admin.js';
import { handleThumbnail } from '../functions/api/lib/thumbnails.js';
import { getR2KeyFromPath, canReadKey } from '../functions/api/lib/request-context.js';
import { handleLogin, verifyAuth, verifyCsrf } from '../functions/api/lib/auth.js';
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
  const settingsRows = new Map();
  const logs = [];
  const sizeOf = body => typeof body === 'string' ? body.length : body?.byteLength || 0;
  const listObjects = (prefix = '') => [...byKey.values()]
    .filter(obj => obj.key.startsWith(prefix))
    .map(obj => ({
      key: obj.key,
      size: obj.size ?? sizeOf(obj.body),
      uploaded: obj.uploaded || new Date('2026-01-01'),
    }));
  return {
    R2_BUCKET: {
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
    DB: {
      prepare(sql) {
        const statement = {
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
            if (/INSERT OR REPLACE INTO settings/i.test(sql)) {
              settingsRows.set('trash_retention_days', statement.bound?.[0]);
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
            return {};
          },
          async first() {
            if (/SELECT COUNT\(\*\) as count FROM trash/i.test(sql)) return { count: trashRows.length };
            if (/SELECT \* FROM trash WHERE id = \?/i.test(sql)) return trashRows.find(row => row.id === statement.bound?.[0]) || null;
            if (/SELECT COUNT\(\*\) as count FROM logs/i.test(sql)) return { count: logs.length };
            if (/SELECT value FROM settings WHERE key = 'trash_retention_days'/i.test(sql)) {
              const value = settingsRows.get('trash_retention_days');
              return value == null ? null : { value };
            }
            return null;
          },
          async all() {
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

test('guest access is disabled unless ALLOW_GUEST is true', async () => {
  const closedEnv = makeEnv();
  assert.equal(await verifyAuth(new Request('https://example.com/api/auth/role'), closedEnv), null);

  const openEnv = makeEnv();
  openEnv.ALLOW_GUEST = 'true';
  assert.deepEqual(await verifyAuth(new Request('https://example.com/api/auth/role'), openEnv), { role: 'guest' });
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
    body: JSON.stringify({ path: '/private', password: '1234', note: 'test', showName: true }),
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
    body: JSON.stringify({ path: '/private', password: '1234' }),
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
  assert.ok(await env.R2_BUCKET.get('docs/readme.txt'));

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
  assert.equal(await env.R2_BUCKET.get('docs/temp.txt'), null);
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
