import test from 'node:test';
import assert from 'node:assert/strict';

import { handleListFiles, handleDownloadOrPreview } from '../functions/api/lib/file-reads.js';
import {
  handleMultipartCreate,
  handleMultipartPart,
  handleMultipartComplete,
  handleMultipartAbort,
  handleTrashList,
  handleTrashRestore,
  handleTrashDelete,
} from '../functions/api/lib/file-mutations.js';
import { handleThumbnail } from '../functions/api/lib/thumbnails.js';
import { getR2KeyFromPath, canReadKey } from '../functions/api/lib/request-context.js';
import { handleLogin, verifyAuth, verifyCsrf } from '../functions/api/lib/auth.js';
import { encodeR2Path, apiFileUrl } from '../public/js/file-paths.js';
import { getOrderedEntries, getSelectableKeys } from '../public/js/file-view-model.js';

function makeEnv({ objects = [], prefixes = [] } = {}) {
  const byKey = new Map(objects.map(o => [o.key, { ...o }]));
  const trashRows = [];
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
        const objectsFromStore = listObjects(prefix);
        if (!delimiter) {
          return {
            delimitedPrefixes: [],
            objects: objectsFromStore,
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
            if (/DELETE FROM trash WHERE id = \?/i.test(sql)) {
              const id = statement.bound?.[0];
              const idx = trashRows.findIndex(row => row.id === id);
              if (idx >= 0) trashRows.splice(idx, 1);
            }
            return {};
          },
          async first() {
            if (/SELECT COUNT\(\*\) as count FROM trash/i.test(sql)) return { count: trashRows.length };
            if (/SELECT \* FROM trash WHERE id = \?/i.test(sql)) return trashRows.find(row => row.id === statement.bound?.[0]) || null;
            if (/SELECT COUNT\(\*\) as count FROM logs/i.test(sql)) return { count: logs.length };
            return null;
          },
          async all() {
            if (/SELECT \* FROM trash ORDER BY trashed_at DESC/i.test(sql)) {
              const size = statement.bound?.[0] ?? 20;
              const offset = statement.bound?.[1] ?? 0;
              return { results: [...trashRows].sort((a, b) => b.trashed_at - a.trashed_at).slice(offset, offset + size) };
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

  const res = await handleListFiles(env, ['secret'], { role: 'guest' }, '');
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

  const guestRes = await handleListFiles(env, [], { role: 'guest' }, '');
  const guestData = await guestRes.json();
  assert.deepEqual(guestData.folders.map(f => f.fullKey), ['public']);
  assert.deepEqual(guestData.files.map(f => f.fullKey), []);

  const adminRes = await handleListFiles(env, [], { role: 'admin' }, '');
  const adminData = await adminRes.json();
  assert.deepEqual(adminData.folders.map(f => f.fullKey), ['public']);
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
