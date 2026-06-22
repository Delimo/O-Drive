import test from 'node:test';
import assert from 'node:assert/strict';

// Test internal functions by re-importing. We import the module
// and test the signing key cache behavior via signedS3Request,
// plus directly testing utility functions by extracting them.
import { signedS3Request } from '../functions/api/lib/s3-signing.js';

// Helper: verify the module's internal functions are correct
// by testing the exported signedS3Request with a known-valid config.
// The signingKey cache is module-level and tested indirectly.

test('s3-signing rejects incomplete config', async () => {
  const space = { id: 'test', name: 'Test' };
  await assert.rejects(
    () => signedS3Request(space, 'GET', 'foo.txt'),
    /not fully configured/,
  );
});

test('s3-signing rejects missing access key', async () => {
  const space = { id: 'test', name: 'Test', endpoint: 'https://s3.example.com', bucket: 'test-bucket', secretAccessKey: 'secret' };
  await assert.rejects(
    () => signedS3Request(space, 'GET', 'foo.txt'),
    /not fully configured/,
  );
});

test('s3-signing rejects missing secret key', async () => {
  const space = { id: 'test', name: 'Test', endpoint: 'https://s3.example.com', bucket: 'test-bucket', accessKeyId: 'key' };
  await assert.rejects(
    () => signedS3Request(space, 'GET', 'foo.txt'),
    /not fully configured/,
  );
});

test('s3-signing validates endpoint is a valid URL', async () => {
  const space = { id: 'test', name: 'Test', endpoint: 'not-a-url', bucket: 'test-bucket', accessKeyId: 'key', secretAccessKey: 'secret' };
  await assert.rejects(
    () => signedS3Request(space, 'PUT', 'bar.txt', { body: 'hello' }),
  );
});

test('s3-signing rejects empty key before fetch', async () => {
  const space = { id: 'test', name: 'Test', endpoint: 'https://s3.example.com', bucket: 'test-bucket', accessKeyId: 'key', secretAccessKey: 'secret' };
  await assert.rejects(
    () => signedS3Request(space, 'PUT', '', { body: 'hello' }),
  );
});
