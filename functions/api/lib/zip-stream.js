const LOCAL_HEADER_BASE = 30;
const CENTRAL_ENTRY_BASE = 46;
const EOCD_SIZE = 22;

function encodeStr(str) {
  return new TextEncoder().encode(str);
}

function makeLocalHeader(filename, size) {
  const nameBytes = encodeStr(filename);
  const buf = new Uint8Array(LOCAL_HEADER_BASE + nameBytes.length);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  dv.setUint32(0, 0x04034b50, true);
  dv.setUint16(4, 20, true);
  dv.setUint16(6, 0, true);
  dv.setUint16(8, 0, true);
  dv.setUint16(10, 0, true);
  dv.setUint16(12, 0, true);
  dv.setUint32(14, 0, true);
  dv.setUint32(18, size, true);
  dv.setUint32(22, size, true);
  dv.setUint16(26, nameBytes.length, true);
  dv.setUint16(28, 0, true);
  buf.set(nameBytes, LOCAL_HEADER_BASE);
  return buf;
}

function makeCentralEntry(filename, size, localOffset) {
  const nameBytes = encodeStr(filename);
  const buf = new Uint8Array(CENTRAL_ENTRY_BASE + nameBytes.length);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  dv.setUint32(0, 0x02014b50, true);
  dv.setUint16(4, 20, true);
  dv.setUint16(6, 20, true);
  dv.setUint16(8, 0, true);
  dv.setUint16(10, 0, true);
  dv.setUint16(12, 0, true);
  dv.setUint16(14, 0, true);
  dv.setUint32(16, 0, true);
  dv.setUint32(20, size, true);
  dv.setUint32(24, size, true);
  dv.setUint16(28, nameBytes.length, true);
  dv.setUint16(30, 0, true);
  dv.setUint16(32, 0, true);
  dv.setUint16(34, 0, true);
  dv.setUint16(36, 0, true);
  dv.setUint32(38, 0, true);
  dv.setUint32(42, localOffset, true);
  buf.set(nameBytes, CENTRAL_ENTRY_BASE);
  return buf;
}

function makeEOCD(entryCount, centralDirSize, centralDirOffset) {
  const buf = new Uint8Array(EOCD_SIZE);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  dv.setUint32(0, 0x06054b50, true);
  dv.setUint16(4, 0, true);
  dv.setUint16(6, 0, true);
  dv.setUint16(8, entryCount, true);
  dv.setUint16(10, entryCount, true);
  dv.setUint32(12, centralDirSize, true);
  dv.setUint32(16, centralDirOffset, true);
  dv.setUint16(20, 0, true);
  return buf;
}

export function buildZipEntries(entries) {
  let offset = 0;
  const centralParts = [];
  const headers = entries.map((e) => {
    const hdr = makeLocalHeader(e.name, e.size);
    const entry = {
      name: e.name,
      size: e.size,
      localOffset: offset,
      header: hdr,
      getStream: e.getStream,
    };
    offset += hdr.length + e.size;
    return entry;
  });
  for (const e of headers) {
    centralParts.push(makeCentralEntry(e.name, e.size, e.localOffset));
  }
  const centralSize = centralParts.reduce((s, b) => s + b.length, 0);
  const centralOffset =
    headers.length > 0
      ? headers[headers.length - 1].localOffset +
        headers[headers.length - 1].header.length +
        headers[headers.length - 1].size
      : 0;
  return {
    headers,
    centralParts,
    eocd: makeEOCD(entries.length, centralSize, centralOffset),
  };
}

export function createZipStream(entries) {
  const { headers, centralParts, eocd } = buildZipEntries(entries);
  let fileIdx = 0;
  let reader = null;
  let done = false;

  return new ReadableStream({
    async pull(controller) {
      if (done) return;
      while (fileIdx < headers.length) {
        const entry = headers[fileIdx];
        if (!reader) {
          controller.enqueue(entry.header);
          reader = (await entry.getStream()).getReader();
        }
        const result = await reader.read();
        if (!result.done) {
          controller.enqueue(result.value);
          return;
        }
        reader.releaseLock();
        reader = null;
        fileIdx++;
      }
      done = true;
      for (const part of centralParts) controller.enqueue(part);
      controller.enqueue(eocd);
      controller.close();
    },
    cancel() {
      if (reader) {
        reader.cancel();
        reader.releaseLock();
        reader = null;
      }
    },
  });
}
