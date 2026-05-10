import test from 'node:test';
import assert from 'node:assert/strict';

import { handleListFiles, handleDownloadOrPreview } from '../functions/api/lib/file-reads.js';
import { getR2KeyFromPath, canReadKey } from '../functions/api/lib/request-context.js';
import { encodeR2Path, apiFileUrl } from '../public/js/file-paths.js';
import { getOrderedEntries, getSelectableKeys } from '../public/js/file-view-model.js';

function makeEnv({ objects = [], prefixes = [] } = {}) {
  const byKey = new Map(objects.map(o => [o.key, o]));
  return {
    R2_BUCKET: {
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

test('preview response streams existing object and 404s missing object', async () => {
  const env = makeEnv({
    objects: [{ key: 'docs/readme.txt', body: 'hello', size: 5, uploaded: new Date('2026-01-01') }],
  });

  const ok = await handleDownloadOrPreview(env, '/api/preview/docs/readme.txt', 'docs/readme.txt');
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('Content-Disposition'), 'inline');

  const missing = await handleDownloadOrPreview(env, '/api/preview/missing.txt', 'missing.txt');
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
