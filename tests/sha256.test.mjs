import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';

import { Sha256, sha256HexStreaming } from '../public/js/vendor/sha256.js';

function nodeSha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

test('incremental sha256 matches node crypto on known vectors', () => {
  const vectors = [
    new Uint8Array(0),
    new TextEncoder().encode('abc'),
    new TextEncoder().encode('hello world'),
    new Uint8Array(55).fill(0x61), // 一个块内的 padding 边界
    new Uint8Array(56).fill(0x61), // 长度字段跨块
    new Uint8Array(64).fill(0x61), // 恰好一个块
    new Uint8Array(65).fill(0x61),
    new Uint8Array(1000).fill(0xff),
  ];
  for (const data of vectors) {
    const hasher = new Sha256();
    hasher.update(data);
    assert.equal(hasher.digest(), nodeSha256(data), `length ${data.length}`);
  }
});

test('incremental sha256 is chunking-invariant', () => {
  const data = randomBytes(200000);
  const expected = nodeSha256(data);

  for (const chunkSize of [1, 7, 63, 64, 65, 4096, 100000]) {
    const hasher = new Sha256();
    for (let i = 0; i < data.length; i += chunkSize) {
      hasher.update(data.subarray(i, Math.min(i + chunkSize, data.length)));
    }
    assert.equal(hasher.digest(), expected, `chunk size ${chunkSize}`);
  }
});

test('sha256HexStreaming hashes a Blob in slices', async () => {
  const data = randomBytes(3 * 1024 * 1024 + 17);
  const blob = new Blob([data]);
  const hex = await sha256HexStreaming(blob, 1024 * 1024);
  assert.equal(hex, nodeSha256(data));
});
