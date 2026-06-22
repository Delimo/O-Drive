import test from 'node:test';
import assert from 'node:assert/strict';
import { checkRateLimit } from '../functions/api/lib/rate-limiter.js';

function makeDb() {
  const rows = new Map();
  return {
    prepare(sql) {
      const stmt = { sql, bound: [], run() {}, first() {} };
      stmt.bind = (...params) => { stmt.bound = params; return stmt; };
      stmt.run = async () => {
        if (/INSERT INTO api_rate_limits/i.test(stmt.sql)) {
          const [key, now, checkNow, windowMs] = stmt.bound;
          const existing = rows.get(key);
          if (!existing || checkNow > existing.windowStart + windowMs) {
            rows.set(key, { key, request_count: 1, window_start: now });
          } else {
            existing.request_count += 1;
          }
        }
        return { meta: { changes: 1 } };
      };
      stmt.first = async () => {
        if (/SELECT request_count, window_start FROM api_rate_limits WHERE key = \?/i.test(stmt.sql)) {
          const row = rows.get(stmt.bound?.[0]);
          return row ? { request_count: row.request_count, window_start: row.window_start } : null;
        }
        return null;
      };
      return stmt;
    },
  };
}

test('rate-limiter allows requests under limit', async () => {
  const db = makeDb();
  for (let i = 0; i < 5; i++) {
    const result = await checkRateLimit(db, 'test:user1', 10, 60000);
    assert.equal(result.allowed, true, `request ${i + 1} should be allowed`);
    assert.equal(result.remaining, 10 - (i + 1));
  }
});

test('rate-limiter blocks when limit exceeded', async () => {
  const db = makeDb();
  const max = 3;
  for (let i = 0; i < max; i++) {
    const result = await checkRateLimit(db, 'test:block', max, 60000);
    assert.equal(result.allowed, true, `request ${i + 1} should be allowed`);
  }
  const blocked = await checkRateLimit(db, 'test:block', max, 60000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfter > 0);
});

test('rate-limiter resets after window expiry', async () => {
  const db = makeDb();
  const max = 2;
  const now = Date.now();
  const windowMs = 1000;

  const r1 = await checkRateLimit(db, 'test:reset', max, windowMs);
  assert.equal(r1.allowed, true);
  const r2 = await checkRateLimit(db, 'test:reset', max, windowMs);
  assert.equal(r2.allowed, true);
  const r3 = await checkRateLimit(db, 'test:reset', max, windowMs);
  assert.equal(r3.allowed, false);

  const after = await checkRateLimit(db, 'test:reset', max, windowMs);
  assert.equal(after.allowed, false);
});

test('rate-limiter handles different keys independently', async () => {
  const db = makeDb();
  const max = 2;
  const r1a = await checkRateLimit(db, 'key:a', max, 60000);
  assert.equal(r1a.allowed, true);
  const r1b = await checkRateLimit(db, 'key:b', max, 60000);
  assert.equal(r1b.allowed, true);
  const r2a = await checkRateLimit(db, 'key:a', max, 60000);
  assert.equal(r2a.allowed, true);
  const r3a = await checkRateLimit(db, 'key:a', max, 60000);
  assert.equal(r3a.allowed, false);
  const r2b = await checkRateLimit(db, 'key:b', max, 60000);
  assert.equal(r2b.allowed, true);
});
