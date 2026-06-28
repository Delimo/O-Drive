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

test('webdav DELETE moves file to trash', { skip: true }, async () => {
  // Skipped: requires full storage module integration
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
