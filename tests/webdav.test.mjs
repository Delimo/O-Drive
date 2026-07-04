import test from 'node:test';
import assert from 'node:assert/strict';

import { onRequest } from '../functions/dav/[[path]].js';
import { verifyBasicAuth } from '../functions/dav/lib/auth.js';
import { handleGet, handlePut, handleDelete, handleMkcol, handleMove, handleCopy } from '../functions/dav/lib/methods.js';
import { handlePropfind } from '../functions/dav/lib/propfind.js';

import { makeEnv } from './helpers/make-env.mjs';

function makeBasicAuth(username, password) {
  return `Basic ${btoa(`${username}:${password}`)}`;
}

test('webdav auth rejects requests without Authorization header', async () => {
  const env = makeEnv();
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'pass';

  const result = await verifyBasicAuth(new Request('https://example.com/dav/'), env);
  assert.equal(result, null);
});

test('webdav auth rejects invalid credentials', async () => {
  const env = makeEnv();
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'pass';

  const result = await verifyBasicAuth(new Request('https://example.com/dav/', {
    headers: { Authorization: makeBasicAuth('admin', 'wrong') },
  }), env);
  assert.equal(result, null);
});

test('webdav auth accepts valid credentials', async () => {
  const env = makeEnv();
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'pass';

  const result = await verifyBasicAuth(new Request('https://example.com/dav/', {
    headers: { Authorization: makeBasicAuth('admin', 'pass') },
  }), env);
  assert.deepEqual(result, { role: 'admin' });
});

test('webdav OPTIONS returns allowed methods', async () => {
  const env = makeEnv();
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'pass';

  const response = await onRequest({
    request: new Request('https://example.com/dav/', { method: 'OPTIONS' }),
    env,
  });
  assert.equal(response.status, 204);
  assert.ok(response.headers.get('Allow').includes('PROPFIND'));
  assert.ok(response.headers.get('DAV'), '1');
});

test('webdav rejects requests when admin password not configured', async () => {
  const env = makeEnv();

  const response = await onRequest({
    request: new Request('https://example.com/dav/test.txt'),
    env,
  });
  assert.equal(response.status, 404);
});

test('webdav rejects unauthenticated requests', async () => {
  const env = makeEnv();
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'pass';

  const response = await onRequest({
    request: new Request('https://example.com/dav/test.txt'),
    env,
  });
  assert.equal(response.status, 401);
});

test('webdav GET returns file content', async () => {
  const env = makeEnv({
    objects: [{ key: 'test.txt', size: 11, body: 'hello world' }],
    prefixes: ['/'],
  });
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'pass';

  const response = await onRequest({
    request: new Request('https://example.com/dav/test.txt', {
      headers: { Authorization: makeBasicAuth('admin', 'pass') },
    }),
    env,
  });
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.equal(body, 'hello world');
});

test('webdav GET returns 404 for missing file', async () => {
  const env = makeEnv({ prefixes: ['/'] });
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'pass';

  const response = await onRequest({
    request: new Request('https://example.com/dav/missing.txt', {
      headers: { Authorization: makeBasicAuth('admin', 'pass') },
    }),
    env,
  });
  assert.equal(response.status, 404);
});

test('webdav HEAD returns headers without body', async () => {
  const env = makeEnv({
    objects: [{ key: 'test.txt', size: 11, body: 'hello world' }],
    prefixes: ['/'],
  });
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'pass';

  const response = await onRequest({
    request: new Request('https://example.com/dav/test.txt', {
      method: 'HEAD',
      headers: { Authorization: makeBasicAuth('admin', 'pass') },
    }),
    env,
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Length'), '11');
});

test('webdav PUT creates new file', async () => {
  const env = makeEnv({ prefixes: ['/'] });
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'pass';

  const response = await onRequest({
    request: new Request('https://example.com/dav/newfile.txt', {
      method: 'PUT',
      body: 'new content',
      headers: {
        Authorization: makeBasicAuth('admin', 'pass'),
        'Content-Type': 'text/plain',
      },
    }),
    env,
  });
  assert.equal(response.status, 201);
});

test('webdav PUT updates existing file', async () => {
  const env = makeEnv({
    objects: [{ key: 'existing.txt', size: 11, body: 'old content' }],
    prefixes: ['/'],
  });
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'pass';

  const response = await onRequest({
    request: new Request('https://example.com/dav/existing.txt', {
      method: 'PUT',
      body: 'updated content',
      headers: {
        Authorization: makeBasicAuth('admin', 'pass'),
        'Content-Type': 'text/plain',
      },
    }),
    env,
  });
  assert.equal(response.status, 204);
});

test('webdav PUT rejects reserved paths', async () => {
  const env = makeEnv({ prefixes: ['/'] });
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'pass';

  const response = await onRequest({
    request: new Request('https://example.com/dav/.thumbs/secret.jpg', {
      method: 'PUT',
      body: 'content',
      headers: {
        Authorization: makeBasicAuth('admin', 'pass'),
        'Content-Type': 'image/jpeg',
      },
    }),
    env,
  });
  assert.equal(response.status, 403);
});

test('webdav DELETE moves file to trash', async () => {
  const env = makeEnv({
    objects: [{ key: 'delete-me.txt', size: 5, body: 'trash' }],
    prefixes: ['/'],
  });
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'pass';

  const response = await onRequest({
    request: new Request('https://example.com/dav/delete-me.txt', {
      method: 'DELETE',
      headers: { Authorization: makeBasicAuth('admin', 'pass') },
    }),
    env,
  });
  assert.equal(response.status, 204);

  // Verify object moved to trash (no longer in R2)
  const head = await env.R2.head('delete-me.txt');
  assert.equal(head, null);
});

test('webdav DELETE returns 404 for missing file', async () => {
  const env = makeEnv({ prefixes: ['/'] });
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'pass';

  const response = await onRequest({
    request: new Request('https://example.com/dav/missing.txt', {
      method: 'DELETE',
      headers: { Authorization: makeBasicAuth('admin', 'pass') },
    }),
    env,
  });
  assert.equal(response.status, 404);
});

test('webdav MKCOL creates directory', async () => {
  const env = makeEnv({ prefixes: ['/'] });
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'pass';

  const response = await onRequest({
    request: new Request('https://example.com/dav/new-folder/', {
      method: 'MKCOL',
      headers: { Authorization: makeBasicAuth('admin', 'pass') },
    }),
    env,
  });
  assert.equal(response.status, 201);
});

test('webdav MKCOL rejects root path', async () => {
  const env = makeEnv({ prefixes: ['/'] });
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'pass';

  const response = await onRequest({
    request: new Request('https://example.com/dav/', {
      method: 'MKCOL',
      headers: { Authorization: makeBasicAuth('admin', 'pass') },
    }),
    env,
  });
  assert.equal(response.status, 405);
});

test('webdav MOVE renames file', async () => {
  const env = makeEnv({
    objects: [{ key: 'source.txt', size: 6, body: 'source' }],
    prefixes: ['/'],
  });
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'pass';

  const response = await onRequest({
    request: new Request('https://example.com/dav/source.txt', {
      method: 'MOVE',
      headers: {
        Authorization: makeBasicAuth('admin', 'pass'),
        Destination: '/dav/dest.txt',
      },
    }),
    env,
  });
  assert.equal(response.status, 201);
});

test('webdav MOVE rejects missing source', async () => {
  const env = makeEnv({ prefixes: ['/'] });
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'pass';

  const response = await onRequest({
    request: new Request('https://example.com/dav/missing.txt', {
      method: 'MOVE',
      headers: {
        Authorization: makeBasicAuth('admin', 'pass'),
        Destination: '/dav/dest.txt',
      },
    }),
    env,
  });
  assert.equal(response.status, 404);
});

test('webdav MOVE rejects overwrite without Overwrite header', async () => {
  const env = makeEnv({
    objects: [
      { key: 'source.txt', size: 6, body: 'source' },
      { key: 'target.txt', size: 6, body: 'target' },
    ],
    prefixes: ['/'],
  });
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'pass';

  const response = await onRequest({
    request: new Request('https://example.com/dav/source.txt', {
      method: 'MOVE',
      headers: {
        Authorization: makeBasicAuth('admin', 'pass'),
        Destination: '/dav/target.txt',
      },
    }),
    env,
  });
  assert.equal(response.status, 412);
});

test('webdav COPY creates copy of file', async () => {
  const env = makeEnv({
    objects: [{ key: 'original.txt', size: 8, body: 'original' }],
    prefixes: ['/'],
  });
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'pass';

  const response = await onRequest({
    request: new Request('https://example.com/dav/original.txt', {
      method: 'COPY',
      headers: {
        Authorization: makeBasicAuth('admin', 'pass'),
        Destination: '/dav/copy.txt',
      },
    }),
    env,
  });
  assert.equal(response.status, 201);
});

test('webdav MOVE directory with files', async () => {
  const env = makeEnv({
    objects: [
      { key: 'src/.folder', size: 0, body: '' },
      { key: 'src/main.js', size: 8, body: 'content' },
      { key: 'src/lib/util.js', size: 6, body: 'helper' },
    ],
    prefixes: ['/'],
  });
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'pass';
  // Pre-populate file_index so keyExists recognizes the directory
  await env.D1.prepare("INSERT INTO file_index (path, parent, name, kind, size) VALUES (?, ?, ?, ?, ?)").bind('src', '', 'src', 'folder', 0).run();
  await env.D1.prepare("INSERT INTO file_index (path, parent, name, kind, size) VALUES (?, ?, ?, ?, ?)").bind('src/main.js', 'src', 'main.js', 'file', 8).run();
  await env.D1.prepare("INSERT INTO file_index (path, parent, name, kind, size) VALUES (?, ?, ?, ?, ?)").bind('src/lib/util.js', 'src/lib', 'util.js', 'file', 6).run();

  const response = await onRequest({
    request: new Request('https://example.com/dav/src', {
      method: 'MOVE',
      headers: {
        Authorization: makeBasicAuth('admin', 'pass'),
        Destination: '/dav/dst',
      },
    }),
    env,
  });
  assert.equal(response.status, 201);

  // Verify source objects gone
  assert.equal(await env.R2.head('src/.folder'), null);
  assert.equal(await env.R2.head('src/main.js'), null);
  // Verify target objects exist
  assert.ok(await env.R2.head('dst/.folder'));
  assert.ok(await env.R2.head('dst/main.js'));
  assert.ok(await env.R2.head('dst/lib/util.js'));
});

test('webdav COPY directory with files', async () => {
  const env = makeEnv({
    objects: [
      { key: 'src/.folder', size: 0, body: '' },
      { key: 'src/main.js', size: 8, body: 'content' },
    ],
    prefixes: ['/'],
  });
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'pass';
  // Pre-populate file_index so keyExists recognizes the directory
  await env.D1.prepare("INSERT INTO file_index (path, parent, name, kind, size) VALUES (?, ?, ?, ?, ?)").bind('src', '', 'src', 'folder', 0).run();
  await env.D1.prepare("INSERT INTO file_index (path, parent, name, kind, size) VALUES (?, ?, ?, ?, ?)").bind('src/main.js', 'src', 'main.js', 'file', 8).run();

  const response = await onRequest({
    request: new Request('https://example.com/dav/src', {
      method: 'COPY',
      headers: {
        Authorization: makeBasicAuth('admin', 'pass'),
        Destination: '/dav/copy',
      },
    }),
    env,
  });
  assert.equal(response.status, 201);

  // Verify source R2 objects still exist
  assert.ok(await env.R2.head('src/.folder'));
  assert.ok(await env.R2.head('src/main.js'));
  // COPY is copy-on-write: creates file_index entries referencing source R2 objects
  // (.folder sentinels are excluded from file_index by design)
  const cm = await env.D1.prepare("SELECT * FROM file_index WHERE path = ?").bind('copy/main.js').first();
  assert.ok(cm, 'copy/main.js should exist in file_index');
  assert.equal(cm.object_key, 'src/main.js');
});

test('webdav MOVE overwrites existing target with Overwrite:T header', async () => {
  const env = makeEnv({
    objects: [
      { key: 'source.txt', size: 6, body: 'source' },
      { key: 'existing.txt', size: 8, body: 'existing' },
    ],
    prefixes: ['/'],
  });
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'pass';

  const response = await onRequest({
    request: new Request('https://example.com/dav/source.txt', {
      method: 'MOVE',
      headers: {
        Authorization: makeBasicAuth('admin', 'pass'),
        Destination: '/dav/existing.txt',
        Overwrite: 'T',
      },
    }),
    env,
  });
  assert.equal(response.status, 204);
  assert.equal(await env.R2.head('source.txt'), null);
  const moved = await env.R2.head('existing.txt');
  assert.ok(moved);
});

test('webdav COPY overwrites existing target with Overwrite:T header', async () => {
  const env = makeEnv({
    objects: [
      { key: 'source.txt', size: 6, body: 'source' },
      { key: 'existing.txt', size: 8, body: 'existing' },
    ],
    prefixes: ['/'],
  });
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'pass';

  const response = await onRequest({
    request: new Request('https://example.com/dav/source.txt', {
      method: 'COPY',
      headers: {
        Authorization: makeBasicAuth('admin', 'pass'),
        Destination: '/dav/existing.txt',
        Overwrite: 'T',
      },
    }),
    env,
  });
  assert.equal(response.status, 204);
  // Source must still exist
  assert.ok(await env.R2.head('source.txt'));
});

test('webdav returns 405 for unsupported methods', async () => {
  const env = makeEnv({ prefixes: ['/'] });
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'pass';

  const response = await onRequest({
    request: new Request('https://example.com/dav/test.txt', {
      method: 'PATCH',
      headers: { Authorization: makeBasicAuth('admin', 'pass') },
    }),
    env,
  });
  assert.equal(response.status, 405);
});

test('webdav rate limiting blocks excessive requests', async () => {
  const env = makeEnv({ prefixes: ['/'] });
  env.ADMIN_USERNAME = 'admin';
  env.ADMIN_PASSWORD = 'pass';

  // Send 31 requests (limit is 30)
  for (let i = 0; i < 30; i++) {
    await onRequest({
      request: new Request('https://example.com/dav/test.txt', {
        headers: { Authorization: makeBasicAuth('admin', 'pass') },
      }),
      env,
    });
  }

  const response = await onRequest({
    request: new Request('https://example.com/dav/test.txt', {
      headers: { Authorization: makeBasicAuth('admin', 'pass') },
    }),
    env,
  });
  assert.equal(response.status, 429);
  assert.ok(response.headers.get('Retry-After'));
});
