import test from 'node:test';
import assert from 'node:assert/strict';

import { handleListFiles, handleDownloadOrPreview } from '../functions/api/lib/file-reads.js';
import {
  handleMultipartCreate,
  handleMultipartPart,
  handleMultipartComplete,
  handleMultipartAbort,
} from '../functions/api/lib/file-mutations.js';
import { handleThumbnail } from '../functions/api/lib/thumbnails.js';
import { getR2KeyFromPath, canReadKey } from '../functions/api/lib/request-context.js';
import { encodeR2Path, apiFileUrl } from '../public/js/file-paths.js';
import { getOrderedEntries, getSelectableKeys } from '../public/js/file-view-model.js';

function makeEnv({ objects = [], prefixes = [] } = {}) {
  const byKey = new Map(objects.map(o => [o.key, o]));
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
      async list() {
        return {
          delimitedPrefixes: prefixes,
          objects,
        };
      },
      async get(key) {
        const obj = byKey.get(key);
        if (!obj) return null;
        return {
          body: obj.body || 'content',
          httpMetadata: obj.httpMetadata || { contentType: 'text/plain' },
        };
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
      prepare() {
        return {
          bind() {
            return { run: async () => ({}) };
          },
        };
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
