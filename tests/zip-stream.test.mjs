import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createZipStream } from '../functions/api/lib/zip-stream.js';

const LOCAL_HDR_SIZE = 30;

function makeTestStream(content) {
  return Promise.resolve(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(content));
      controller.close();
    }
  }));
}

async function collectStream(stream) {
  const reader = stream.getReader();
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.length; }
  return buf;
}

describe('zip-stream', () => {
  it('generates valid ZIP with single file', async () => {
    const entries = [
      { name: 'hello.txt', size: 13, getStream: () => makeTestStream('Hello, World!') },
    ];
    const buf = await collectStream(createZipStream(entries));
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

    assert.strictEqual(dv.getUint32(0, true), 0x04034b50, 'local file header sig');

    const nameLen = dv.getUint16(26, true);
    const name = new TextDecoder().decode(buf.slice(LOCAL_HDR_SIZE, LOCAL_HDR_SIZE + nameLen));
    assert.strictEqual(name, 'hello.txt');

    const storedSize = dv.getUint32(18, true);
    assert.strictEqual(storedSize, 13);

    const hdrTotal = LOCAL_HDR_SIZE + nameLen;
    const content = new TextDecoder().decode(buf.slice(hdrTotal, hdrTotal + 13));
    assert.strictEqual(content, 'Hello, World!');

    const eocdOffset = buf.length - 22;
    assert.strictEqual(dv.getUint32(eocdOffset, true), 0x06054b50, 'EOCD sig');
    assert.strictEqual(dv.getUint16(eocdOffset + 8, true), 1, 'entry count');
  });

  it('generates valid ZIP with multiple files and folders', async () => {
    const entries = [
      { name: 'a.txt', size: 1, getStream: () => makeTestStream('a') },
      { name: 'dir/b.txt', size: 1, getStream: () => makeTestStream('b') },
      { name: 'dir/sub/c.txt', size: 1, getStream: () => makeTestStream('c') },
    ];
    const buf = await collectStream(createZipStream(entries));
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

    const eocdOffset = buf.length - 22;
    assert.strictEqual(dv.getUint32(eocdOffset, true), 0x06054b50);
    assert.strictEqual(dv.getUint16(eocdOffset + 8, true), 3, '3 entries');
  });

  it('handles empty entry list', async () => {
    const buf = await collectStream(createZipStream([]));
    assert.ok(buf.length >= 22);
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const eocdOffset = buf.length - 22;
    assert.strictEqual(dv.getUint32(eocdOffset, true), 0x06054b50);
    assert.strictEqual(dv.getUint16(eocdOffset + 8, true), 0, '0 entries');
  });

  it('central directory entries have correct offsets', async () => {
    const entries = [
      { name: 'first.bin', size: 5, getStream: () => makeTestStream('12345') },
      { name: 'second.bin', size: 3, getStream: () => makeTestStream('678') },
    ];
    const buf = await collectStream(createZipStream(entries));
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

    // Find central directory start right before EOCD
    const eocdStart = buf.length - 22;
    const centralOffset = dv.getUint32(eocdStart + 16, true);
    const centralSize = dv.getUint32(eocdStart + 12, true);

    // First central entry should point to local header at 0
    const entry1offset = centralOffset;
    assert.strictEqual(dv.getUint32(entry1offset, true), 0x02014b50, 'central entry 1 sig');
    assert.strictEqual(dv.getUint32(entry1offset + 42, true), 0, 'first file at offset 0');

    // Second central entry
    const nameLen1 = dv.getUint16(entry1offset + 28, true);
    const entry2offset = entry1offset + 46 + nameLen1;
    assert.strictEqual(dv.getUint32(entry2offset, true), 0x02014b50, 'central entry 2 sig');

    // Second file starts after first header + first file content
    const expectedOffset = LOCAL_HDR_SIZE + 'first.bin'.length + 5;
    assert.strictEqual(dv.getUint32(entry2offset + 42, true), expectedOffset, 'second file offset');
  });
});
