import test from 'node:test';
import assert from 'node:assert/strict';

import { onRequest } from '../functions/api/[[path]].js';
import { recordSystemWarning } from '../functions/api/lib/common.js';
import { handleListFiles, handleDownloadOrPreview, handleSearch } from '../functions/api/lib/file-reads.js';
import {
  handleMultipartCreate,
  handleMultipartPart,
  handleMultipartComplete,
  handleMultipartAbort,
  handleRename,
  handleUpload,
  handleOperationEstimate,
  handleTrashList,
  handleTrashRestore,
  handleTrashDelete,
  handleTrashClear,
  handleTrashCleanup,
  handleTrashRetention,
  handlePaste,
  handleBatchDelete,
} from '../functions/api/lib/file-mutations.js';
import { handleAdminHealth, handleAdminLogs, handleAdminQuota, handleAdminStats } from '../functions/api/lib/admin.js';
import { handleAdminStorage, handleAdminStorageTest } from '../functions/api/lib/storage.js';
import { handleThumbnail } from '../functions/api/lib/thumbnails.js';
import { getR2KeyFromPath, canReadKey, loadHiddenPaths } from '../functions/api/lib/request-context.js';
import { handleLogin, verifyAuth, verifyCsrf } from '../functions/api/lib/auth.js';
import { getFileIndexEntry, getIndexedStorageUsed, indexedFileCount, upsertFileIndex, searchFileIndex } from '../functions/api/lib/file-index.js';
import { setStorageQuota as setStorageQuotaForTest } from '../functions/api/lib/storage-quota.js';
import { createFileTask, updateFileTask } from '../functions/api/lib/tasks.js';
import {
  handleProtectedSettings,
  handleProtectedUnlock,
  loadProtectedPaths,
  checkProtectedAccess,
} from '../functions/api/lib/protected-paths.js';
import { encodeR2Path, apiFileUrl } from '../public/js/file-paths.js';
import { getOrderedEntries, getSelectableKeys } from '../public/js/file-view-model.js';

import { makeEnv } from './helpers/make-env.mjs';

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

test('search filters indexed results by kind size and modified dates', async () => {
  const env = makeEnv();
  await upsertFileIndex(env, 'docs/photo.jpg', { size: 2048, contentType: 'image/jpeg', uploaded: new Date('2026-01-04') });
  await upsertFileIndex(env, 'docs/photo.txt', { size: 512, contentType: 'text/plain', uploaded: new Date('2025-01-04') });

  const res = await handleSearch(
    env,
    new Request('https://example.com/api/search?q=photo&scope=/docs&kind=image&minSize=1&modifiedAfter=2026-01-01'),
    new URL('https://example.com/api/search?q=photo&scope=/docs&kind=image&minSize=1&modifiedAfter=2026-01-01'),
    [],
    { role: 'guest' },
    [],
  );
  const data = await res.json();

  assert.deepEqual(data.files.map(file => file.fullKey), ['docs/photo.jpg']);
});

test('indexed search keeps scanning past hidden rows for guest pagination', async () => {
  const env = makeEnv();
  await upsertFileIndex(env, 'hidden/alpha-1.txt', { size: 1, uploaded: Date.now() });
  await upsertFileIndex(env, 'hidden/alpha-2.txt', { size: 1, uploaded: Date.now() });
  await upsertFileIndex(env, 'visible/alpha-3.txt', { size: 1, uploaded: Date.now() });

  const indexed = await searchFileIndex(
    env,
    { q: 'alpha', scope: '/', limit: 1, cursor: '' },
    ['hidden'],
    { role: 'guest' },
  );

  assert.equal(indexed.files.length, 1);
  assert.equal(indexed.files[0].fullKey, 'visible/alpha-3.txt');
  assert.equal(indexed.nextCursor, '');
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

test('hidden path loading ignores non-hidden settings rows', async () => {
  const env = makeEnv();
  await env.D1.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, 'hidden')").bind('secret').run();
  await env.D1.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('trash_retention_days', ?)").bind('30').run();

  assert.deepEqual(await loadHiddenPaths(env), ['secret']);
});

test('admin can permanently remove hidden path rules', async () => {
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

  const create = await onRequest({
    env,
    request: new Request('https://example.com/api/admin/settings/hidden', {
      method: 'POST',
      body: JSON.stringify({ targetPath: 'secret' }),
      headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': loginData.csrf },
    }),
  });
  assert.equal(create.status, 200);
  assert.deepEqual(await loadHiddenPaths(env), ['secret']);

  const remove = await onRequest({
    env,
    request: new Request('https://example.com/api/admin/settings/hidden?path=secret', {
      method: 'DELETE',
      headers: { Cookie: cookie, 'X-CSRF-Token': loginData.csrf },
    }),
  });
  assert.equal(remove.status, 200);
  assert.deepEqual(await loadHiddenPaths(env), []);
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

test('token secret signs admin sessions independently from admin password', async () => {
  const env = makeEnv();
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'pass';
  env.TOKEN_SECRET = 'test-token-secret-that-is-long-enough-for-hmac';

  const login = await handleLogin(new Request('https://example.com/api/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: 'pass' }),
    headers: { 'Content-Type': 'application/json' },
  }), env);
  const loginData = await login.json();
  const cookie = login.headers.get('Set-Cookie');
  assert.equal(login.status, 200);

  env.ADMIN_PASSWORD = 'new-admin-password';
  const auth = await verifyAuth(new Request('https://example.com/api/auth/role', {
    headers: { Cookie: cookie },
  }), env);

  assert.equal(auth.role, 'admin');
  assert.equal(auth.csrf, loginData.csrf);
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

test('admin login failure burst sends one webhook alert during cooldown', async () => {
  const env = makeEnv();
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'pass';
  env.LOGIN_ALERT_COOLDOWN_SECONDS = '1800';
  const calls = [];
  const waitUntilPromises = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response('ok', { status: 200 });
  };

  const drainWaitUntil = async () => {
    while (waitUntilPromises.length) {
      const batch = waitUntilPromises.splice(0);
      await Promise.all(batch);
    }
  };

  try {
    await env.D1.prepare('INSERT OR REPLACE INTO kv_config (key, value) VALUES (?, ?)')
      .bind('webhooks', JSON.stringify([{ name: 'login-alert', url: 'https://hooks.example.test/login', events: ['login.burst'] }]))
      .run();

    for (let i = 0; i < 5; i++) {
      const failed = await handleLogin(new Request('https://example.com/api/login', {
        method: 'POST',
        body: JSON.stringify({ username: 'admin', password: 'bad' }),
        headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.88', 'user-agent': 'login-test' },
      }), env, {
        waitUntil(promise) {
          waitUntilPromises.push(promise);
        },
      });
      assert.equal(failed.status, 401);
      await drainWaitUntil();
    }

    const locked = await handleLogin(new Request('https://example.com/api/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: 'pass' }),
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.88', 'user-agent': 'login-test' },
    }), env, {
      waitUntil(promise) {
        waitUntilPromises.push(promise);
      },
    });
    assert.equal(locked.status, 429);
    await drainWaitUntil();

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://hooks.example.test/login');
    assert.equal(calls[0].body.event, 'login.burst');
    assert.equal(calls[0].body.data.ip, '203.0.113.88');
    assert.equal(calls[0].body.data.username, 'admin');
    assert.equal(calls[0].body.data.attempts, 5);
    assert.equal(calls[0].body.data.threshold, 5);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('guest access is disabled unless ALLOW_GUEST is true', async () => {
  const closedEnv = makeEnv();
  assert.equal(await verifyAuth(new Request('https://example.com/api/auth/role'), closedEnv), null);

  const openEnv = makeEnv();
  openEnv.ALLOW_GUEST = 'true';
  assert.deepEqual(await verifyAuth(new Request('https://example.com/api/auth/role'), openEnv), { role: 'guest' });
});

test('route rejects oversized non-upload request bodies early', async () => {
  const env = makeEnv();
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'admin-secret';

  const res = await onRequest({
    env,
    request: new Request('https://example.com/api/login', {
      method: 'POST',
      body: '{}',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(512 * 1024 + 1),
      },
    }),
  });
  const data = await res.json();

  assert.equal(res.status, 413);
  assert.equal(data.success, false);
  assert.match(data.message, /Request body too large/);
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

test('admin file task runs paste work in the background task table', async () => {
  const env = makeEnv({
    objects: [{ key: 'source.txt', body: 'hello', size: 5, uploaded: new Date('2026-01-01') }],
  });
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'admin-secret';
  const waitUntilPromises = [];

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

  const created = await onRequest({
    env,
    request: new Request('https://example.com/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ type: 'paste', payload: { action: 'copy', paths: ['source.txt'], targetDir: '/copies/' } }),
      headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': loginData.csrf },
    }),
    waitUntil(promise) {
      waitUntilPromises.push(promise);
    },
  });
  assert.equal(created.status, 202);
  const createdData = await created.json();
  assert.ok(createdData.item.id);
  await Promise.all(waitUntilPromises);

  const status = await onRequest({
    env,
    request: new Request(`https://example.com/api/tasks?id=${createdData.item.id}`, {
      headers: { Cookie: cookie },
    }),
  });
  const statusData = await status.json();
  assert.equal(statusData.item.status, 'completed');
  const copied = await handleDownloadOrPreview(env, new Request('https://example.com/api/preview/copies/source.txt'), '/api/preview/copies/source.txt', 'copies/source.txt');
  assert.equal(copied.status, 200);

  const list = await onRequest({
    env,
    request: new Request('https://example.com/api/tasks', {
      headers: { Cookie: cookie },
    }),
  });
  const listData = await list.json();
  assert.equal(list.status, 200);
  assert.equal(listData.items.length, 1);
  assert.equal(listData.items[0].id, createdData.item.id);
});

test('upload tasks can be created and updated by client uploader', async () => {
  const env = makeEnv();
  const create = await createFileTask(env, new Request('https://example.com/api/tasks', {
    method: 'POST',
    body: JSON.stringify({
      type: 'upload',
      payload: {
        files: [
          { name: 'a.bin', size: 10 },
          { name: 'b.bin', size: 20 },
        ],
      },
    }),
    headers: { 'Content-Type': 'application/json' },
  }));
  assert.equal(create.status, 202);
  const created = await create.json();
  assert.equal(created.item.type, 'upload');
  assert.equal(created.item.status, 'queued');
  assert.equal(created.item.total, 2);

  const update = await updateFileTask(env, new Request(`https://example.com/api/tasks?id=${created.item.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'running',
      completed: 1,
      failed: 0,
      result: { progressPct: 60, currentFile: 'b.bin' },
    }),
    headers: { 'Content-Type': 'application/json' },
  }), new URL(`https://example.com/api/tasks?id=${created.item.id}`));
  assert.equal(update.status, 200);
  const updated = await update.json();
  assert.equal(updated.item.status, 'running');
  assert.equal(updated.item.completed, 1);
  assert.equal(updated.item.result.progressPct, 60);
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

test('thumbnail endpoint falls back to the original image when resizing fails', async () => {
  const env = makeEnv({
    objects: [{
      key: 'photos/a.jpg',
      body: 'image-bytes',
      size: 11,
      uploaded: new Date('2026-01-01'),
      httpMetadata: { contentType: 'image/jpeg' },
    }],
  });
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('resize failed', { status: 502 });
  try {
    const res = await handleThumbnail(env, new Request('https://example.com/api/thumbnail/photos/a.jpg?w=360&h=260'), 'photos/a.jpg', {});
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Content-Type'), 'image/jpeg');
    assert.equal(await res.text(), 'image-bytes');
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test('thumbnail endpoint reads aliased image paths from their backing object', async () => {
  const env = makeEnv({
    objects: [{
      key: 'photos/a.jpg',
      body: 'image-bytes',
      size: 11,
      uploaded: new Date('2026-01-01'),
      httpMetadata: { contentType: 'image/jpeg' },
    }],
  });
  await handlePaste(env, new Request('https://example.com', {
    method: 'POST',
    body: JSON.stringify({ action: 'copy', paths: ['photos/a.jpg'], targetDir: '/copies' }),
    headers: { 'Content-Type': 'application/json' },
  }));

  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('resize failed', { status: 502 });
  try {
    const res = await handleThumbnail(env, new Request('https://example.com/api/thumbnail/copies/a.jpg?w=360&h=260'), 'copies/a.jpg', {});
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Content-Type'), 'image/jpeg');
    assert.equal(await res.text(), 'image-bytes');
  } finally {
    globalThis.fetch = oldFetch;
  }
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

test('admin logs can be filtered by query action ip and date range', async () => {
  const env = makeEnv();
  await env.D1.prepare('INSERT INTO logs (action, details, ip) VALUES (?, ?, ?)')
    .bind('UPLOAD', 'docs/readme.txt', '192.0.2.10')
    .run();
  await env.D1.prepare('INSERT INTO logs (action, details, ip) VALUES (?, ?, ?)')
    .bind('DELETE', 'private/old.txt', '198.51.100.20')
    .run();

  const res = await handleAdminLogs(env, new URL('https://example.com/api/admin/logs?q=readme&action=UPLOAD&ip=192.0.2&from=2000-01-01&to=2099-01-01'));
  const data = await res.json();

  assert.equal(data.totalPages, 1);
  assert.equal(data.logs.length, 1);
  assert.equal(data.logs[0].action, 'UPLOAD');
  assert.equal(data.logs[0].details, 'docs/readme.txt');
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

test('batch delete preserves serial-like behavior for duplicate paths', async () => {
  const env = makeEnv({
    objects: [
      { key: 'docs/readme.txt', body: 'hello', size: 5, uploaded: new Date('2026-01-01') },
    ],
  });

  const res = await (await import('../functions/api/lib/file-mutations.js')).handleBatchDelete(env, new Request('https://example.com', {
    method: 'POST',
    body: JSON.stringify({ paths: ['docs/readme.txt', 'docs/readme.txt'] }),
    headers: { 'Content-Type': 'application/json' },
  }));
  const data = await res.json();

  assert.equal(res.status, 200);
  assert.equal(data.completed, 1);
  assert.equal(data.failed.length, 1);
  assert.equal(data.failed[0].path, 'docs/readme.txt');
  assert.match(data.failed[0].message, /not found/i);
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

test('rename refuses missing source paths', async () => {
  const env = makeEnv();

  await assert.rejects(
    () => handleRename(env, new Request('https://example.com', {
      method: 'PUT',
      body: JSON.stringify({ newName: 'renamed.txt' }),
      headers: { 'Content-Type': 'application/json' },
    }), 'docs/missing.txt'),
    err => {
      assert.equal(err.status, 404);
      assert.match(err.message, /not found/i);
      return true;
    },
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

test('same-storage copy creates a logical alias without duplicating the object', async () => {
  const env = makeEnv({
    objects: [
      { key: 'docs/source.txt', body: 'hello', size: 5, uploaded: new Date('2026-01-01') },
    ],
  });

  const copy = await handlePaste(env, new Request('https://example.com', {
    method: 'POST',
    body: JSON.stringify({ action: 'copy', paths: ['docs/source.txt'], targetDir: '/copies' }),
    headers: { 'Content-Type': 'application/json' },
  }));
  assert.equal((await copy.json()).success, true);

  const sourceIndex = await getFileIndexEntry(env, 'docs/source.txt');
  const copiedIndex = await getFileIndexEntry(env, 'copies/source.txt');
  assert.equal(sourceIndex.object_key, 'docs/source.txt');
  assert.equal(copiedIndex.object_key, 'docs/source.txt');
  assert.equal(copiedIndex.path, 'copies/source.txt');
  assert.equal(await env.R2.get('copies/source.txt'), null);
  assert.equal(await getIndexedStorageUsed(env, 'r2'), 5);

  const copied = await handleDownloadOrPreview(env, new Request('https://example.com/api/preview/copies/source.txt'), '/api/preview/copies/source.txt', 'copies/source.txt');
  assert.equal(copied.status, 200);
  assert.equal(await copied.text(), 'hello');
});

test('deleting original and alias paths only removes the backing object after the last reference', async () => {
  const env = makeEnv({
    objects: [
      { key: 'docs/source.txt', body: 'hello', size: 5, uploaded: new Date('2026-01-01') },
    ],
  });

  await handlePaste(env, new Request('https://example.com', {
    method: 'POST',
    body: JSON.stringify({ action: 'copy', paths: ['docs/source.txt'], targetDir: '/copies' }),
    headers: { 'Content-Type': 'application/json' },
  }));

  const deleteOriginal = await handleBatchDelete(env, new Request('https://example.com', {
    method: 'POST',
    body: JSON.stringify({ paths: ['docs/source.txt'] }),
    headers: { 'Content-Type': 'application/json' },
  }));
  assert.equal((await deleteOriginal.json()).success, true);
  assert.equal(await getFileIndexEntry(env, 'docs/source.txt'), null);
  assert.equal(await env.R2.get('docs/source.txt'), null);
  const missingOriginal = await handleDownloadOrPreview(env, new Request('https://example.com/api/preview/docs/source.txt'), '/api/preview/docs/source.txt', 'docs/source.txt');
  assert.equal(missingOriginal.status, 404);

  const copiedIndex = await getFileIndexEntry(env, 'copies/source.txt');
  assert.match(copiedIndex.object_key, /^\.system\/file-objects\/r2\//);
  assert.ok(await env.R2.get(copiedIndex.object_key));
  const copied = await handleDownloadOrPreview(env, new Request('https://example.com/api/preview/copies/source.txt'), '/api/preview/copies/source.txt', 'copies/source.txt');
  assert.equal(copied.status, 200);
  assert.equal(await copied.text(), 'hello');

  const deleteAlias = await handleBatchDelete(env, new Request('https://example.com', {
    method: 'POST',
    body: JSON.stringify({ paths: ['copies/source.txt'] }),
    headers: { 'Content-Type': 'application/json' },
  }));
  assert.equal((await deleteAlias.json()).success, true);
  assert.equal(await getFileIndexEntry(env, 'copies/source.txt'), null);
  assert.equal(await env.R2.get(copiedIndex.object_key), null);
});

test('cross-storage copy writes a real object to the destination storage', async () => {
  const env = makeEnv({
    objects: [
      { key: 'docs/source.txt', body: 'hello', size: 5, uploaded: new Date('2026-01-01') },
    ],
  });
  await handleAdminStorage(env, new Request('https://example.com/api/admin/settings/storage', {
    method: 'PUT',
    body: JSON.stringify({
      r2QuotaBytes: '9.5GB',
      overflowEnabled: true,
      overflowThresholdPercent: 85,
      spaces: [{
        id: 's3-main',
        name: 'S3-主存储',
        endpoint: 'https://s3.example.test',
        bucket: 'bucket-a',
        accessKeyId: 'ak',
        secretAccessKey: 'sk',
        region: 'auto',
        enabled: true,
      }],
      bindings: [{ path: 's3', storageId: 's3-main' }],
    }),
    headers: { 'Content-Type': 'application/json' },
  }), 'PUT');

  const oldFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method });
    if (options.method === 'HEAD') return new Response('', { status: 404 });
    if (options.method === 'GET') return new Response('hello', { status: 200, headers: { 'content-length': '5', 'content-type': 'text/plain' } });
    return new Response('', { status: 200 });
  };
  try {
    const copy = await handlePaste(env, new Request('https://example.com', {
      method: 'POST',
      body: JSON.stringify({ action: 'copy', paths: ['docs/source.txt'], targetDir: '/s3' }),
      headers: { 'Content-Type': 'application/json' },
    }));
    assert.equal((await copy.json()).success, true);

    const put = calls.find(call => call.method === 'PUT');
    assert.ok(put);
    assert.match(put.url, /s3\.example\.test\/bucket-a\/s3\/source\.txt/);
    assert.equal(await env.R2.get('s3/source.txt'), null);
    const copiedIndex = await getFileIndexEntry(env, 's3/source.txt');
    assert.equal(copiedIndex.storage_id, 's3-main');
    assert.equal(copiedIndex.object_key, 's3/source.txt');

    const copied = await handleDownloadOrPreview(env, new Request('https://example.com/api/preview/s3/source.txt'), '/api/preview/s3/source.txt', 's3/source.txt');
    assert.equal(copied.status, 200);
    assert.equal(await copied.text(), 'hello');
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test('paste preserves conflict behavior when multiple sources target the same destination name', async () => {
  const env = makeEnv({
    objects: [
      { key: 'docs/a.txt', body: 'a', size: 1, uploaded: new Date('2026-01-01') },
      { key: 'misc/a.txt', body: 'aa', size: 2, uploaded: new Date('2026-01-02') },
    ],
  });

  const res = await handlePaste(env, new Request('https://example.com', {
    method: 'POST',
    body: JSON.stringify({ action: 'copy', paths: ['docs/a.txt', 'misc/a.txt'], targetDir: '/copies' }),
    headers: { 'Content-Type': 'application/json' },
  }));
  const data = await res.json();

  assert.equal(res.status, 200);
  assert.equal(data.completed, 1);
  assert.equal(data.failed.length, 1);
  assert.match(data.failed[0].message, /already exists/i);
  const copied = await handleDownloadOrPreview(env, new Request('https://example.com/api/preview/copies/a.txt'), '/api/preview/copies/a.txt', 'copies/a.txt');
  assert.equal(copied.status, 200);
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

test('skipped upload conflicts do not require remaining quota', async () => {
  const env = makeEnv({
    objects: [{ key: 'docs/report.pdf', body: 'old', size: 3, uploaded: new Date('2026-01-01') }],
  });
  await setStorageQuotaForTest(env.D1, 3);
  await upsertFileIndex(env, 'docs/report.pdf', { size: 3, contentType: 'application/pdf', uploaded: new Date('2026-01-01') });

  const form = new FormData();
  form.append('file', new File(['new-content'], 'report.pdf', { type: 'application/pdf' }));
  const upload = await handleUpload(env, new Request('https://example.com/api/files/docs?conflict=skip', {
    method: 'POST',
    body: form,
  }), 'docs');
  const uploadData = await upload.json();
  assert.equal(upload.status, 200);
  assert.equal(uploadData.skipped, true);

  const multipart = await handleMultipartCreate(env, new Request('https://example.com', {
    method: 'POST',
    body: JSON.stringify({ targetDir: '/docs', name: 'report.pdf', type: 'application/pdf', totalSize: 10, conflict: 'skip' }),
    headers: { 'Content-Type': 'application/json' },
  }));
  const multipartData = await multipart.json();
  assert.equal(multipart.status, 200);
  assert.equal(multipartData.skipped, true);
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

test('admin quota accepts human-readable capacity input', async () => {
  const env = makeEnv();
  const expected = Math.floor(9.5 * 1024 * 1024 * 1024);

  const saved = await handleAdminQuota(env, new Request('https://example.com/api/admin/settings/quota', {
    method: 'PUT',
    body: JSON.stringify({ bytes: '9.5GB' }),
    headers: { 'Content-Type': 'application/json' },
  }), 'PUT');
  assert.equal(saved.status, 200);

  const loaded = await handleAdminQuota(env, new Request('https://example.com/api/admin/settings/quota'), 'GET');
  const data = await loaded.json();
  assert.equal(data.quota, expected);
  assert.equal(data.quotaFormatted, '9.5 GB');
});

test('R2 high-water uploads overflow to configured S3 with a visible warning', async () => {
  const env = makeEnv();
  await upsertFileIndex(env, 'existing.bin', { size: 9 * 1024 * 1024 * 1024, storageId: 'r2', uploaded: Date.now() });
  const saved = await handleAdminStorage(env, new Request('https://example.com/api/admin/settings/storage', {
    method: 'PUT',
    body: JSON.stringify({
      r2QuotaBytes: 10 * 1024 * 1024 * 1024,
      overflowEnabled: true,
      overflowThresholdPercent: 85,
      spaces: [{
        id: 's3-main',
        name: 'S3-主存储',
        endpoint: 'https://s3.example.test',
        bucket: 'bucket-a',
        accessKeyId: 'ak',
        secretAccessKey: 'sk',
        region: 'auto',
        enabled: true,
        overflowTarget: true,
      }],
      bindings: [],
    }),
  }), 'PUT');
  assert.equal(saved.status, 200);

  const oldFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method });
    return new Response('', { status: 200 });
  };
  try {
    const form = new FormData();
    form.append('file', new File(['new-content'], 'overflow.txt', { type: 'text/plain' }));
    const upload = await handleUpload(env, new Request('https://example.com/api/files', { method: 'POST', body: form }), '');
    const data = await upload.json();
    assert.equal(upload.status, 200);
    assert.equal(data.storageId, 's3-main');
    assert.equal(data.overflowed, true);
    assert.match(data.warning, /R2 空间已使用/);
    assert.equal(calls[0]?.method, 'PUT');
    assert.match(calls[0]?.url || '', /s3\.example\.test/);

    const listed = await handleListFiles(env, new Request('https://example.com/api/files'), [], { role: 'admin' }, '');
    const listedData = await listed.json();
    assert.ok(listedData.files.some(item => item.fullKey === 'overflow.txt' && item.storageId === 's3-main'));
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test('admin can test S3-compatible storage connectivity', async () => {
  const env = makeEnv();
  const oldFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method, auth: options.headers?.get?.('authorization') || '' });
    return new Response('<ListBucketResult></ListBucketResult>', { status: 200 });
  };
  try {
    const res = await handleAdminStorageTest(env, new Request('https://example.com/api/admin/settings/storage/test', {
      method: 'POST',
      body: JSON.stringify({
        space: {
          id: 's3-main',
          name: 'S3-主存储',
          endpoint: 'https://s3.example.test',
          bucket: 'bucket-a',
          accessKeyId: 'ak',
          secretAccessKey: 'sk',
          region: 'auto',
        },
      }),
    }));
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.equal(calls[0]?.method, 'GET');
    assert.match(calls[0]?.url || '', /list-type=2/);
    assert.match(calls[0]?.auth || '', /AWS4-HMAC-SHA256/);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test('admin S3 storage test reports connection failures', async () => {
  const env = makeEnv();
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('Forbidden', { status: 403 });
  try {
    const res = await handleAdminStorageTest(env, new Request('https://example.com/api/admin/settings/storage/test', {
      method: 'POST',
      body: JSON.stringify({
        space: {
          id: 's3-main',
          name: 'S3-主存储',
          endpoint: 'https://s3.example.test',
          bucket: 'bucket-a',
          accessKeyId: 'bad',
          secretAccessKey: 'bad',
          region: 'auto',
        },
      }),
    }));
    const data = await res.json();
    assert.equal(res.status, 502);
    assert.equal(data.success, false);
    assert.match(data.message, /HTTP 403/);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test('uploads enforce the selected storage bucket quota', async () => {
  const env = makeEnv();
  await upsertFileIndex(env, 'r2-used.bin', { size: Math.floor(9.5 * 1024 * 1024 * 1024) - 2, storageId: 'r2', uploaded: Date.now() });
  await handleAdminStorage(env, new Request('https://example.com/api/admin/settings/storage', {
    method: 'PUT',
    body: JSON.stringify({
      r2QuotaBytes: '9.5GB',
      overflowEnabled: false,
      overflowThresholdPercent: 85,
      spaces: [],
      bindings: [],
    }),
  }), 'PUT');

  const tooLarge = new FormData();
  tooLarge.append('file', new File(['hello'], 'too-large.bin', { type: 'application/octet-stream' }));
  const denied = await handleUpload(env, new Request('https://example.com/api/files', { method: 'POST', body: tooLarge }), '');
  const deniedData = await denied.json();
  assert.equal(denied.status, 507);
  assert.match(deniedData.message, /Cloudflare R2 空间配额不足/);
});

test('uploads enforce S3 bucket quota after path binding', async () => {
  const env = makeEnv();
  await upsertFileIndex(env, 's3/a.bin', { size: 90, storageId: 's3-main', uploaded: Date.now() });
  await handleAdminStorage(env, new Request('https://example.com/api/admin/settings/storage', {
    method: 'PUT',
    body: JSON.stringify({
      r2QuotaBytes: '9.5GB',
      overflowEnabled: true,
      overflowThresholdPercent: 85,
      spaces: [{
        id: 's3-main',
        name: 'S3-主存储',
        endpoint: 'https://s3.example.test',
        bucket: 'bucket-a',
        accessKeyId: 'ak',
        secretAccessKey: 'sk',
        region: 'auto',
        quotaBytes: '100B',
        enabled: true,
        overflowTarget: true,
      }],
      bindings: [{ path: 's3', storageId: 's3-main' }],
    }),
  }), 'PUT');

  const form = new FormData();
  form.append('file', new File(['hello world'], 'b.txt', { type: 'text/plain' }));
  const denied = await handleUpload(env, new Request('https://example.com/api/files/s3', { method: 'POST', body: form }), 's3');
  const data = await denied.json();
  assert.equal(denied.status, 507);
  assert.equal(data.storageId, 's3-main');
  assert.match(data.message, /S3-主存储 空间配额不足/);
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
  assert.equal(data.attention.at(-1).title, '暂无需要处理的事项');
});

test('admin stats can summarize from file index', async () => {
  const env = makeEnv();
  await upsertFileIndex(env, 'photos/a.jpg', { size: 5, contentType: 'image/jpeg', uploaded: new Date('2026-01-03') });
  await upsertFileIndex(env, 'docs/readme.md', { size: 4, contentType: 'text/markdown', uploaded: new Date('2026-01-02') });
  await recordSystemWarning(env, 'test.warning', 'attention');

  const res = await handleAdminStats(env);
  const data = await res.json();

  assert.equal(data.files.count, 2);
  assert.equal(data.files.totalSize, 9);
  assert.equal(data.breakdown.image.count, 1);
  assert.equal(data.breakdown.text.count, 1);
  assert.deepEqual(data.latest.map(item => item.key), ['photos/a.jpg', 'docs/readme.md']);
  assert.ok(data.attention.some(item => item.title === '系统提醒待查看'));
});

test('admin attention warns when storage quota usage reaches 90 percent', async () => {
  const env = makeEnv();
  await setStorageQuotaForTest(env.D1, 100);
  await upsertFileIndex(env, 'docs/archive.zip', { size: 90, contentType: 'application/zip', uploaded: new Date('2026-01-03') });

  const res = await handleAdminStats(env);
  const data = await res.json();
  const item = data.attention.find(entry => entry.title === '存储空间即将用满');

  assert.ok(item);
  assert.equal(item.level, 'warning');
  assert.equal(item.tab, 'quota');
  assert.match(item.body, /90%/);
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

test('operation logs can be manually cleaned with retention policy', async () => {
  const env = makeEnv();
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'admin-secret';
  const realNow = Date.now;
  const base = new Date('2026-06-01T00:00:00Z').getTime();

  try {
    for (let i = 0; i < 2005; i++) {
      Date.now = () => base + i * 1000;
      await env.D1.prepare('INSERT INTO logs (action, details, ip) VALUES (?, ?, ?)').bind('TEST', `log-${i}`, '127.0.0.1').run();
    }
    for (let i = 0; i < 3; i++) {
      Date.now = () => base - 91 * 24 * 60 * 60 * 1000 - i * 1000;
      await env.D1.prepare('INSERT INTO logs (action, details, ip) VALUES (?, ?, ?)').bind('OLD', `old-${i}`, '127.0.0.2').run();
    }
    Date.now = () => base + 2006 * 1000;

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

    const cleanup = await onRequest({
      env,
      request: new Request('https://example.com/api/admin/maintenance', {
        method: 'POST',
        body: JSON.stringify({ action: 'cleanup-logs' }),
        headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': loginData.csrf },
      }),
    });
    const cleanupData = await cleanup.json();
    assert.equal(cleanup.status, 200);
    assert.equal(cleanupData.deleted, 8);

    const listed = await handleAdminLogs(env, new URL('https://example.com/api/admin/logs?page=1&size=20'));
    const listedData = await listed.json();
    assert.equal(listedData.totalPages, 100);
    assert.equal(listedData.logs.length, 20);
    assert.equal(listedData.logs[0].details, '清理旧操作日志 8 条');
    assert.equal(listedData.logs[1].details, 'log-2004');
    assert.equal(listedData.logs.some(row => row.action === 'OLD'), false);
  } finally {
    Date.now = realNow;
  }
});

test('system warnings are capped to recent rows', async () => {
  const env = makeEnv();
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'admin-secret';

  for (let i = 0; i < 105; i++) {
    await recordSystemWarning(env, 'test.warning', `warning-${i}`);
  }

  const health = await handleAdminHealth(env);
  const data = await health.json();
  assert.equal(data.warnings.length, 10);
  assert.equal(data.warnings[0].message, 'warning-104');
  assert.equal(data.warnings.at(-1).message, 'warning-95');

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
  const cleanup = await onRequest({
    env,
    request: new Request('https://example.com/api/admin/maintenance', {
      method: 'POST',
      body: JSON.stringify({ action: 'cleanup-warnings' }),
      headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': loginData.csrf },
    }),
  });
  const cleanupData = await cleanup.json();
  assert.equal(cleanup.status, 200);
  assert.equal(cleanupData.deleted, 100);

  const cleanedHealth = await handleAdminHealth(env);
  assert.deepEqual((await cleanedHealth.json()).warnings, []);
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

test('webhook endpoints can subscribe to selected events only', async () => {
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
        body: JSON.stringify({
          items: [
            { name: 'uploads', url: 'https://hooks.example.test/uploads', events: ['file.uploaded'] },
            { name: 'folders', url: 'https://hooks.example.test/folders', events: ['folder.created'] },
          ],
        }),
        headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': loginData.csrf },
      }),
    });
    assert.equal(save.status, 200);

    const mkdir = await onRequest({
      env,
      request: new Request('https://example.com/api/mkdir', {
        method: 'POST',
        body: JSON.stringify({ folderName: 'event-docs' }),
        headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': loginData.csrf },
      }),
      waitUntil(promise) {
        waitUntilPromises.push(promise);
      },
    });
    assert.equal(mkdir.status, 200);
    await Promise.all(waitUntilPromises);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://hooks.example.test/folders');
    assert.equal(calls[0].body.event, 'folder.created');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('single-file upload webhook uses the final uploaded file path', async () => {
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
        body: JSON.stringify({ items: [{ url: 'https://hooks.example.test/upload' }] }),
        headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': loginData.csrf },
      }),
    });
    assert.equal(save.status, 200);

    const form = new FormData();
    form.set('file', new File(['hello'], 'note.txt', { type: 'text/plain' }));
    const upload = await onRequest({
      env,
      request: new Request('https://example.com/api/files/docs', {
        method: 'POST',
        body: form,
        headers: { Cookie: cookie, 'X-CSRF-Token': loginData.csrf },
      }),
      waitUntil(promise) {
        waitUntilPromises.push(promise);
      },
    });
    assert.equal(upload.status, 200);
    await Promise.all(waitUntilPromises);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.event, 'file.uploaded');
    assert.equal(calls[0].body.data.path, '/docs/note.txt');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('nested mkdir webhook uses the created folder path', async () => {
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
        body: JSON.stringify({ items: [{ url: 'https://hooks.example.test/folder' }] }),
        headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': loginData.csrf },
      }),
    });
    assert.equal(save.status, 200);

    const mkdir = await onRequest({
      env,
      request: new Request('https://example.com/api/mkdir/docs', {
        method: 'POST',
        body: JSON.stringify({ folderName: 'nested' }),
        headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': loginData.csrf },
      }),
      waitUntil(promise) {
        waitUntilPromises.push(promise);
      },
    });
    assert.equal(mkdir.status, 200);
    await Promise.all(waitUntilPromises);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.event, 'folder.created');
    assert.equal(calls[0].body.data.path, '/docs/nested/');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('purge webhook sends the original trash path instead of the trash record id', async () => {
  const env = makeEnv({
    objects: [{ key: 'docs/report.txt', body: 'hello', size: 5, uploaded: new Date('2026-01-01') }],
  });
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
        body: JSON.stringify({ items: [{ url: 'https://hooks.example.test/purge' }] }),
        headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': loginData.csrf },
      }),
    });
    assert.equal(save.status, 200);

    const trash = await onRequest({
      env,
      request: new Request('https://example.com/api/batch-delete', {
        method: 'POST',
        body: JSON.stringify({ paths: ['docs/report.txt'] }),
        headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': loginData.csrf },
      }),
      waitUntil(promise) {
        waitUntilPromises.push(promise);
      },
    });
    assert.equal(trash.status, 200);

    const trashList = await onRequest({
      env,
      request: new Request('https://example.com/api/trash', {
        headers: { Cookie: cookie },
      }),
    });
    const trashData = await trashList.json();
    const id = trashData.items[0]?.id;
    assert.ok(id);

    calls.length = 0;
    waitUntilPromises.length = 0;

    const purge = await onRequest({
      env,
      request: new Request('https://example.com/api/trash/delete', {
        method: 'DELETE',
        body: JSON.stringify({ id }),
        headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': loginData.csrf },
      }),
      waitUntil(promise) {
        waitUntilPromises.push(promise);
      },
    });
    assert.equal(purge.status, 200);
    await Promise.all(waitUntilPromises);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.event, 'file.purged');
    assert.deepEqual(calls[0].body.data.paths, ['docs/report.txt']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('download burst webhook alerts once during cooldown', async () => {
  const env = makeEnv({
    objects: [{ key: 'docs/readme.txt', body: 'hello', size: 5, uploaded: new Date('2026-01-01') }],
  });
  env.ALLOW_GUEST = 'true';
  env.DOWNLOAD_BURST_THRESHOLD = '3';
  env.DOWNLOAD_BURST_WINDOW_SECONDS = '300';
  env.DOWNLOAD_BURST_COOLDOWN_SECONDS = '1800';
  env.DOWNLOAD_BURST_BLOCK_SECONDS = '1800';

  const calls = [];
  const waitUntilPromises = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response('ok', { status: 200 });
  };

  const drainWaitUntil = async () => {
    while (waitUntilPromises.length) {
      const batch = waitUntilPromises.splice(0);
      await Promise.all(batch);
    }
  };

  try {
    await env.D1.prepare('INSERT OR REPLACE INTO kv_config (key, value) VALUES (?, ?)')
      .bind('webhooks', JSON.stringify([{ name: 'download-alert', url: 'https://hooks.example.test/downloads', events: ['download.burst'] }]))
      .run();

    for (let i = 0; i < 3; i++) {
      const res = await onRequest({
        env,
        request: new Request('https://example.com/api/download/docs/readme.txt', {
          headers: { 'cf-connecting-ip': '203.0.113.77', 'user-agent': 'burst-test' },
        }),
        waitUntil(promise) {
          waitUntilPromises.push(promise);
        },
      });
      assert.equal(res.status, 200);
      await drainWaitUntil();
    }

    const blocked = await onRequest({
      env,
      request: new Request('https://example.com/api/download/docs/readme.txt', {
        headers: { 'cf-connecting-ip': '203.0.113.77', 'user-agent': 'burst-test' },
      }),
      waitUntil(promise) {
        waitUntilPromises.push(promise);
      },
    });
    assert.equal(blocked.status, 429);
    const blockedData = await blocked.json();
    assert.equal(blockedData.code, 'DOWNLOAD_BLOCKED');
    assert.ok(Number(blocked.headers.get('Retry-After')) > 0);
    await drainWaitUntil();

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://hooks.example.test/downloads');
    assert.equal(calls[0].body.event, 'download.burst');
    assert.equal(calls[0].body.data.ip, '203.0.113.77');
    assert.equal(calls[0].body.data.role, 'guest');
    assert.equal(calls[0].body.data.count, 3);
    assert.equal(calls[0].body.data.threshold, 3);
    assert.equal(calls[0].body.data.blockSeconds, 1800);
    assert.ok(calls[0].body.data.blockedUntil);
    assert.deepEqual(calls[0].body.data.samplePaths, ['/docs/readme.txt']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('download burst block can be disabled with zero seconds', async () => {
  const env = makeEnv({
    objects: [{ key: 'docs/readme.txt', body: 'hello', size: 5, uploaded: new Date('2026-01-01') }],
  });
  env.ALLOW_GUEST = 'true';
  env.DOWNLOAD_BURST_THRESHOLD = '2';
  env.DOWNLOAD_BURST_WINDOW_SECONDS = '300';
  env.DOWNLOAD_BURST_COOLDOWN_SECONDS = '1800';
  env.DOWNLOAD_BURST_BLOCK_SECONDS = '0';

  for (let i = 0; i < 3; i++) {
    const res = await onRequest({
      env,
      request: new Request('https://example.com/api/download/docs/readme.txt', {
        headers: { 'cf-connecting-ip': '203.0.113.88' },
      }),
    });
    assert.equal(res.status, 200);
  }
});

test('webhook request settings customize outgoing notification requests', async () => {
  const env = makeEnv();
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'admin-secret';
  const calls = [];
  const waitUntilPromises = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
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
        body: JSON.stringify({
          items: [{
            name: 'custom',
            url: 'https://hooks.example.test/custom',
            method: 'PUT',
            contentType: 'application/custom+json',
            headers: { 'X-Source': 'O-Drive', Authorization: 'Bearer custom-token' },
            body: '{"event":"{event}","path":"{{data.path}}"}',
          }],
        }),
        headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': loginData.csrf },
      }),
    });
    assert.equal(save.status, 200);

    const mkdir = await onRequest({
      env,
      request: new Request('https://example.com/api/mkdir', {
        method: 'POST',
        body: JSON.stringify({ folderName: 'custom-docs' }),
        headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': loginData.csrf },
      }),
      waitUntil(promise) {
        waitUntilPromises.push(promise);
      },
    });
    assert.equal(mkdir.status, 200);
    await Promise.all(waitUntilPromises);

    assert.equal(calls[0].url, 'https://hooks.example.test/custom');
    assert.equal(calls[0].init.method, 'PUT');
    assert.equal(calls[0].init.headers['Content-Type'], 'application/custom+json');
    assert.equal(calls[0].init.headers['X-Source'], 'O-Drive');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer custom-token');
    assert.equal(calls[0].init.body, '{"event":"folder.created","path":"/custom-docs/"}');
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

    const deliveries = await onRequest({
      env,
      request: new Request('https://example.com/api/admin/webhook-deliveries', {
        headers: { Cookie: cookie },
      }),
    });
    assert.equal(deliveries.status, 200);
    const deliveryData = await deliveries.json();
    assert.equal(deliveryData.items.length, 1);
    assert.equal(deliveryData.items[0].event, 'webhook.test');
    assert.equal(deliveryData.items[0].ok, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('webhook delivery records are capped while showing the latest page', async () => {
  const env = makeEnv();
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'admin-secret';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('ok', { status: 200 });

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

    for (let i = 0; i < 205; i++) {
      const res = await onRequest({
        env,
        request: new Request('https://example.com/api/admin/settings/webhooks', {
          method: 'POST',
          body: JSON.stringify({ endpoint: { name: `receiver-${i}`, url: `https://example.com/webhook-${i}` } }),
          headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': loginData.csrf },
        }),
      });
      assert.equal(res.status, 200);
    }

    const deliveries = await onRequest({
      env,
      request: new Request('https://example.com/api/admin/webhook-deliveries', {
        headers: { Cookie: cookie },
      }),
    });
    const data = await deliveries.json();
    assert.equal(data.items.length, 20);
    assert.equal(data.items[0].endpoint, 'receiver-204');
    assert.equal(data.items.at(-1).endpoint, 'receiver-185');
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
    assert.match(calls[0].body.text.content, /O-Drive 新建文件夹/);
    assert.match(calls[0].body.text.content, /事件：新建文件夹/);
    assert.match(calls[0].body.text.content, /时间：\d{4}\/\d{1,2}\/\d{1,2}/);
    assert.doesNotMatch(calls[0].body.text.content, /中国时间/);
    assert.doesNotMatch(calls[0].body.text.content, /folder\.created/);
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
    assert.match(calls[1].body.markdown.content, /事件：测试通知/);
    assert.doesNotMatch(calls[1].body.markdown.content, /webhook\.test/);
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

test('admin can create public share links and expired shares are deleted', async () => {
  const env = makeEnv({
    objects: [{ key: 'docs/readme.txt', body: 'hello', size: 5, uploaded: new Date('2026-01-01') }],
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

  const create = await onRequest({
    env,
    request: new Request('https://example.com/api/admin/shares', {
      method: 'POST',
      body: JSON.stringify({ path: '/docs/readme.txt', expiresInDays: 7, maxDownloads: 2 }),
      headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': loginData.csrf },
    }),
  });
  assert.equal(create.status, 200);
  const created = await create.json();
  const token = created.item?.token;
  assert.ok(token);

  const info = await onRequest({
    env,
    request: new Request(`https://example.com/api/share/${token}/info`),
  });
  assert.equal(info.status, 200);
  assert.equal((await info.json()).item.path, 'docs/readme.txt');

  const download = await onRequest({
    env,
    request: new Request(`https://example.com/api/share/${token}/download`, {
      headers: { 'cf-connecting-ip': '203.0.113.9' },
    }),
  });
  assert.equal(download.status, 200);

  const shares = await onRequest({
    env,
    request: new Request('https://example.com/api/admin/shares', {
      headers: { Cookie: cookie },
    }),
  });
  const shareRows = await shares.json();
  assert.equal(shareRows.items[0].lastAccessIp, '203.0.113.9');

  const exhausted = await onRequest({
    env,
    request: new Request(`https://example.com/api/share/${token}/download`),
  });
  assert.equal(exhausted.status, 200);

  const exhaustedAgain = await onRequest({
    env,
    request: new Request(`https://example.com/api/share/${token}/download`),
  });
  assert.equal(exhaustedAgain.status, 410);
  const exhaustedData = await exhaustedAgain.json();
  assert.equal(exhaustedData.deleted, true);

  const missing = await onRequest({
    env,
    request: new Request(`https://example.com/api/share/${token}/info`),
  });
  assert.equal(missing.status, 404);
});

test('password protected share links require unlock before access', async () => {
  const env = makeEnv({
    objects: [{ key: 'docs/secret.txt', body: 'hidden', size: 6, uploaded: new Date('2026-01-01') }],
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

  const create = await onRequest({
    env,
    request: new Request('https://example.com/api/admin/shares', {
      method: 'POST',
      body: JSON.stringify({ path: '/docs/secret.txt', password: 'open-sesame' }),
      headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': loginData.csrf },
    }),
  });
  assert.equal(create.status, 200);
  const created = await create.json();
  assert.equal(created.item.hasPassword, true);
  const token = created.item.token;

  const blocked = await onRequest({
    env,
    request: new Request(`https://example.com/api/share/${token}/info`),
  });
  assert.equal(blocked.status, 403);
  assert.equal((await blocked.json()).code, 'SHARE_PASSWORD_REQUIRED');

  const wrong = await onRequest({
    env,
    request: new Request(`https://example.com/api/share/${token}/unlock`, {
      method: 'POST',
      body: JSON.stringify({ password: 'wrong' }),
      headers: { 'Content-Type': 'application/json' },
    }),
  });
  assert.equal(wrong.status, 403);

  const unlock = await onRequest({
    env,
    request: new Request(`https://example.com/api/share/${token}/unlock`, {
      method: 'POST',
      body: JSON.stringify({ password: 'open-sesame' }),
      headers: { 'Content-Type': 'application/json' },
    }),
  });
  assert.equal(unlock.status, 200);
  const shareCookie = unlock.headers.get('Set-Cookie');
  assert.ok(shareCookie?.includes(`share_access_${token}`));

  const info = await onRequest({
    env,
    request: new Request(`https://example.com/api/share/${token}/info`, {
      headers: { Cookie: shareCookie },
    }),
  });
  assert.equal(info.status, 200);
  assert.equal((await info.json()).item.path, 'docs/secret.txt');

  const download = await onRequest({
    env,
    request: new Request(`https://example.com/api/share/${token}/download`, {
      headers: { Cookie: shareCookie },
    }),
  });
  assert.equal(download.status, 200);
});

test('admin can manually clean expired share records', async () => {
  const env = makeEnv({
    objects: [{ key: 'docs/old.txt', body: 'old', size: 3, uploaded: new Date('2026-01-01') }],
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

  const create = await onRequest({
    env,
    request: new Request('https://example.com/api/admin/shares', {
      method: 'POST',
      body: JSON.stringify({ path: 'docs/old.txt', expiresAt: Date.now() - 1000 }),
      headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': loginData.csrf },
    }),
  });
  assert.equal(create.status, 200);

  const cleanup = await onRequest({
    env,
    request: new Request('https://example.com/api/admin/shares', {
      method: 'POST',
      body: JSON.stringify({ action: 'cleanup-expired' }),
      headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': loginData.csrf },
    }),
  });
  assert.equal(cleanup.status, 200);
  assert.equal((await cleanup.json()).deleted, 1);

  const listed = await onRequest({
    env,
    request: new Request('https://example.com/api/admin/shares', {
      headers: { Cookie: cookie },
    }),
  });
  assert.deepEqual((await listed.json()).items, []);
});

test('recently expired share records are retained until manual delete or retention passes', async () => {
  const env = makeEnv({
    objects: [{ key: 'docs/recently-expired.txt', body: 'old', size: 3, uploaded: new Date('2026-01-01') }],
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

  const create = await onRequest({
    env,
    request: new Request('https://example.com/api/admin/shares', {
      method: 'POST',
      body: JSON.stringify({ path: 'docs/recently-expired.txt', expiresAt: Date.now() - 1000 }),
      headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': loginData.csrf },
    }),
  });
  assert.equal(create.status, 200);
  const token = (await create.json()).item.token;

  const expired = await onRequest({
    env,
    request: new Request(`https://example.com/api/share/${token}/info`),
  });
  assert.equal(expired.status, 410);
  const expiredData = await expired.json();
  assert.equal(expiredData.deleted, false);
  assert.ok(expiredData.autoDeleteAt > Date.now());

  const listed = await onRequest({
    env,
    request: new Request('https://example.com/api/admin/shares', {
      headers: { Cookie: cookie },
    }),
  });
  const listedData = await listed.json();
  assert.equal(listedData.items.length, 1);
  assert.equal(listedData.items[0].expired, true);

  const deleted = await onRequest({
    env,
    request: new Request(`https://example.com/api/admin/shares?token=${encodeURIComponent(token)}`, {
      method: 'DELETE',
      headers: { Cookie: cookie, 'X-CSRF-Token': loginData.csrf },
    }),
  });
  assert.equal(deleted.status, 200);
  assert.deepEqual(await deleted.json(), { success: true });
});

test('expired share access sends one webhook notification', async () => {
  const env = makeEnv({
    objects: [{ key: 'docs/notify-expired.txt', body: 'old', size: 3, uploaded: new Date('2026-01-01') }],
  });
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'admin-secret';
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response('ok', { status: 200 });
  };

  try {
    await env.D1.prepare('INSERT OR REPLACE INTO kv_config (key, value) VALUES (?, ?)')
      .bind('webhooks', JSON.stringify([{ name: 'share-expired', url: 'https://hooks.example.test/share', events: ['share.expired'] }]))
      .run();

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

    const create = await onRequest({
      env,
      request: new Request('https://example.com/api/admin/shares', {
        method: 'POST',
        body: JSON.stringify({ path: 'docs/notify-expired.txt', expiresAt: Date.now() - 1000 }),
        headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': loginData.csrf },
      }),
    });
    const token = (await create.json()).item.token;

    const first = await onRequest({ env, request: new Request(`https://example.com/api/share/${token}/info`) });
    const second = await onRequest({ env, request: new Request(`https://example.com/api/share/${token}/info`) });

    assert.equal(first.status, 410);
    assert.equal(second.status, 410);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.event, 'share.expired');
    assert.equal(calls[0].body.data.token, token);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('admin share list auto-removes expired share records', async () => {
  const env = makeEnv({
    objects: [{ key: 'docs/expired.txt', body: 'old', size: 3, uploaded: new Date('2026-01-01') }],
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

  const create = await onRequest({
    env,
    request: new Request('https://example.com/api/admin/shares', {
      method: 'POST',
      body: JSON.stringify({ path: 'docs/expired.txt', expiresAt: Date.now() - 8 * 24 * 60 * 60 * 1000 }),
      headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': loginData.csrf },
    }),
  });
  assert.equal(create.status, 200);

  const listed = await onRequest({
    env,
    request: new Request('https://example.com/api/admin/shares', {
      headers: { Cookie: cookie },
    }),
  });
  assert.equal(listed.status, 200);
  assert.deepEqual((await listed.json()).items, []);
});

test('webhook notifications ignore legacy env settings', async () => {
  const env = makeEnv();
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'admin-secret';
  env[['WEBHOOK', 'URLS'].join('_')] = 'https://hooks.example.test/legacy-env';
  const calls = [];
  const waitUntilPromises = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: init?.body });
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

    const listed = await onRequest({
      env,
      request: new Request('https://example.com/api/admin/settings/webhooks', {
        headers: { Cookie: cookie },
      }),
    });
    assert.deepEqual(await listed.json(), { items: [], urls: [] });

    const mkdir = await onRequest({
      env,
      request: new Request('https://example.com/api/mkdir', {
        method: 'POST',
        body: JSON.stringify({ folderName: 'no-env-webhook' }),
        headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': loginData.csrf },
      }),
      waitUntil(promise) {
        waitUntilPromises.push(promise);
      },
    });
    assert.equal(mkdir.status, 200);
    await Promise.all(waitUntilPromises);
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mkdir can bind a new folder to selected storage', async () => {
  const env = makeEnv();
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'admin-secret';
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 200 });

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
      request: new Request('https://example.com/api/admin/settings/storage', {
        method: 'PUT',
        body: JSON.stringify({
          spaces: [{
            id: 's3-main',
            name: 'S3-主存储',
            endpoint: 'https://s3.example.com',
            bucket: 'bucket-a',
            accessKeyId: 'ak',
            secretAccessKey: 'sk',
            region: 'auto',
            enabled: true,
            overflowTarget: true,
          }],
          bindings: [],
        }),
        headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': loginData.csrf },
      }),
    });
    assert.equal(save.status, 200);

    const mkdir = await onRequest({
      env,
      request: new Request('https://example.com/api/mkdir', {
        method: 'POST',
        body: JSON.stringify({ folderName: 'archive', storageId: 's3-main' }),
        headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': loginData.csrf },
      }),
    });
    assert.equal(mkdir.status, 200);
    const mkdirData = await mkdir.json();
    assert.equal(mkdirData.storageId, 's3-main');

    const listed = await onRequest({
      env,
      request: new Request('https://example.com/api/admin/settings/storage', {
        headers: { Cookie: cookie },
      }),
    });
    const listedData = await listed.json();
    assert.deepEqual(listedData.bindings, [{ path: 'archive', storageId: 's3-main' }]);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test('mkdir can override inherited storage back to r2', async () => {
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
    request: new Request('https://example.com/api/admin/settings/storage', {
      method: 'PUT',
      body: JSON.stringify({
        spaces: [{
          id: 's3-main',
          name: 'S3-主存储',
          endpoint: 'https://s3.example.com',
          bucket: 'bucket-a',
          enabled: true,
          overflowTarget: true,
        }],
        bindings: [{ path: 'archive', storageId: 's3-main' }],
      }),
      headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': loginData.csrf },
    }),
  });
  assert.equal(save.status, 200);

  const mkdir = await onRequest({
    env,
    request: new Request('https://example.com/api/mkdir/archive', {
      method: 'POST',
      body: JSON.stringify({ folderName: 'local', storageId: 'r2' }),
      headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': loginData.csrf },
    }),
  });
  assert.equal(mkdir.status, 200);
  const mkdirData = await mkdir.json();
  assert.equal(mkdirData.storageId, 'r2');

  const listed = await onRequest({
    env,
    request: new Request('https://example.com/api/admin/settings/storage', {
      headers: { Cookie: cookie },
    }),
  });
  const listedData = await listed.json();
  assert.deepEqual(listedData.bindings, [
    { path: 'archive', storageId: 's3-main' },
    { path: 'archive/local', storageId: 'r2' },
  ]);
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
  assert.equal(data.env.tokenSecret.configured, false);
  assert.equal(data.env.tokenSecret.source, 'ADMIN_PASSWORD');
  assert.equal(data.env.guestEnabled, false);
  assert.deepEqual(data.warnings, []);
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
