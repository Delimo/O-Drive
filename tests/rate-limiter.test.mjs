import test from 'node:test';
import assert from 'node:assert/strict';
import { checkRateLimit, resetRateLimiter } from '../functions/api/lib/rate-limiter.js';

test('rate-limiter allows requests under limit', () => {
  resetRateLimiter();
  for (let i = 0; i < 5; i++) {
    const result = checkRateLimit('test:user1', 10, 60000);
    assert.equal(result.allowed, true, `request ${i + 1} should be allowed`);
  }
});

test('rate-limiter blocks when limit exceeded', () => {
  resetRateLimiter();
  const max = 3;
  for (let i = 0; i < max; i++) {
    const result = checkRateLimit('test:block', max, 60000);
    assert.equal(result.allowed, true, `request ${i + 1} should be allowed`);
  }
  const blocked = checkRateLimit('test:block', max, 60000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfter > 0);
});

test('rate-limiter handles different keys independently', () => {
  resetRateLimiter();
  const max = 2;
  const r1a = checkRateLimit('key:a', max, 60000);
  assert.equal(r1a.allowed, true);
  const r1b = checkRateLimit('key:b', max, 60000);
  assert.equal(r1b.allowed, true);
  const r2a = checkRateLimit('key:a', max, 60000);
  assert.equal(r2a.allowed, true);
  const r3a = checkRateLimit('key:a', max, 60000);
  assert.equal(r3a.allowed, false);
  const r2b = checkRateLimit('key:b', max, 60000);
  assert.equal(r2b.allowed, true);
});
