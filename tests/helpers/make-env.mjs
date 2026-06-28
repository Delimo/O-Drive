export function makeEnv({ objects = [], prefixes = [], listPageSize = Infinity } = {}) {
  const byKey = new Map(objects.map(o => [o.key, { ...o }]));
  const trashRows = [];
  const protectedRows = [];
  const pathAttemptRows = [];
  const loginAttemptRows = [];
  const loginAlertRows = [];
  const downloadBurstRows = [];
  const webhookDeliveryRows = [];
  let webhookDeliveryNextId = 1;
  const systemWarningRows = [];
  let systemWarningNextId = 1;
  const taskRows = [];
  const notificationRows = [];
  let notificationNextId = 1;
  const settingsRows = new Map();
  const kvRows = new Map();
  const fileIndexRows = [];
  const storageUsageRows = [];
  const storageObjectRows = [];
  const shareRows = [];
  const logs = [];
  let logNextId = 1;
  const sizeOf = body => typeof body === 'string' ? body.length : body?.byteLength || 0;
  const listObjects = (prefix = '') => [...byKey.values()]
    .filter(obj => obj.key.startsWith(prefix))
    .map(obj => ({
      key: obj.key,
      size: obj.size ?? sizeOf(obj.body),
      uploaded: obj.uploaded || new Date('2026-01-01'),
    }));
  const filteredTrashRows = (bound = []) => {
    let rows = [...trashRows];
    let idx = 0;
    if (bound.length >= 2 && typeof bound[idx] === 'string' && String(bound[idx]).startsWith('%')) {
      const q = String(bound[idx]).replace(/%/g, '').toLowerCase();
      idx += 2;
      rows = rows.filter(row => row.original_key.toLowerCase().includes(q) || row.name.toLowerCase().includes(q));
    }
    if (['file', 'folder'].includes(bound[idx])) {
      const kind = bound[idx++];
      rows = rows.filter(row => row.kind === kind);
    }
    if (typeof bound[idx] === 'number') {
      const from = bound[idx++];
      rows = rows.filter(row => row.trashed_at >= from);
    }
    if (typeof bound[idx] === 'number') {
      const to = bound[idx++];
      rows = rows.filter(row => row.trashed_at <= to);
    }
    return rows;
  };
  const materializedLogs = () => [...logs]
    .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0) || Number(b.id || 0) - Number(a.id || 0));
  const filteredLogs = (sql = '', bound = []) => {
    let rows = materializedLogs();
    let idx = 0;
    const likeText = value => String(value || '').replace(/%/g, '').toLowerCase();
    if (/\(action LIKE \? OR details LIKE \? OR ip LIKE \?\)/i.test(sql)) {
      const q = likeText(bound[idx]);
      idx += 3;
      rows = rows.filter(row => String(row.action || '').toLowerCase().includes(q)
        || String(row.details || '').toLowerCase().includes(q)
        || String(row.ip || '').toLowerCase().includes(q));
    }
    if (/action = \?/i.test(sql)) {
      const action = String(bound[idx++] || '').toUpperCase();
      rows = rows.filter(row => String(row.action || '').toUpperCase() === action);
    }
    if (/ip LIKE \?/i.test(sql)) {
      const ip = likeText(bound[idx++]);
      rows = rows.filter(row => String(row.ip || '').toLowerCase().includes(ip));
    }
    if (/timestamp >= \?/i.test(sql)) {
      const ts = Number(bound[idx++] || 0);
      rows = rows.filter(row => Number(row.timestamp || 0) >= ts);
    }
    if (/timestamp <= \?/i.test(sql)) {
      const ts = Number(bound[idx++] || 0);
      rows = rows.filter(row => Number(row.timestamp || 0) <= ts);
    }
    return rows;
  };
  return {
    R2: {
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
      async list(opts = {}) {
        const prefix = opts.prefix || '';
        const delimiter = opts.delimiter;
        const cursor = Number(opts.cursor || 0);
        const limit = Math.min(Number(opts.limit || listPageSize), listPageSize);
        const objectsFromStore = listObjects(prefix);
        if (!delimiter) {
          const page = objectsFromStore.slice(cursor, cursor + limit);
          const nextCursor = cursor + page.length;
          return {
            delimitedPrefixes: [],
            objects: page,
            truncated: nextCursor < objectsFromStore.length,
            cursor: String(nextCursor),
          };
        }
        const folderSet = new Set(
          prefixes
            .filter(p => p.startsWith(prefix))
            .map(p => p)
        );
        for (const key of byKey.keys()) {
          if (!key.startsWith(prefix)) continue;
          const rest = key.slice(prefix.length);
          const idx = rest.indexOf('/');
          if (idx > 0) folderSet.add(prefix + rest.slice(0, idx + 1));
        }
        return {
          delimitedPrefixes: [...folderSet],
          objects: objectsFromStore.filter(obj => !obj.key.slice(prefix.length).includes('/')),
        };
      },
      async get(key) {
        const obj = byKey.get(key);
        if (!obj) return null;
        return {
          body: obj.body || 'content',
          httpMetadata: obj.httpMetadata || { contentType: 'text/plain' },
          size: obj.size ?? sizeOf(obj.body),
        };
      },
      async put(key, body, options = {}) {
        byKey.set(key, { key, body, httpMetadata: options.httpMetadata || {}, size: sizeOf(body) });
      },
      async delete(key) {
        byKey.delete(key);
      },
      async copy(sourceKey, destKey, options) {
        const obj = byKey.get(sourceKey);
        if (!obj) return;
        byKey.set(destKey, { ...obj, key: destKey });
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
    D1: {
      async batch(statements) {
        const results = [];
        for (const stmt of statements) {
          const sql = stmt.sql || '';
          if (/^\s*(INSERT|UPDATE|DELETE|CREATE)/i.test(sql)) {
            results.push(await stmt.run());
          } else {
            try {
              const result = await stmt.all();
              results.push(result);
            } catch (_) {
              try {
                results.push(await stmt.first());
              } catch (_2) {
                results.push(null);
              }
            }
          }
        }
        return results;
      },
      prepare(sql) {
        const statement = {
          sql,
          bind(...params) {
            statement.bound = params;
            return statement;
          },
          async run() {
            let changes = 0;
            if (/UPDATE file_tasks\s+SET/i.test(sql)) {
              const id = statement.bound?.at(-1);
              const row = taskRows.find(item => item.id === id);
              if (row) {
                const clause = sql.replace(/.*SET\s+/i, '').replace(/\s+WHERE.*/i, '').trim();
                const parts = clause.split(',').map(p => p.trim());
                let pi = 0;
                for (const part of parts) {
                  const m = part.match(/^(\w+)\s*=/);
                  if (!m) { pi++; continue; }
                  const col = m[1];
                  const val = statement.bound?.[pi];
                  if (col === 'status') row.status = String(val ?? '');
                  else if (col === 'error') row.error = String(val ?? '');
                  else if (col === 'total') row.total = Number(val ?? 0);
                  else if (col === 'completed') row.completed = Number(val ?? 0);
                  else if (col === 'failed') row.failed = Number(val ?? 0);
                  else if (col === 'finished_at') row.finished_at = Number(val ?? 0);
                  else if (col === 'updated_at') row.updated_at = Number(val ?? 0);
                  else if (col === 'result') {
                    if (val && typeof val === 'object' && !Array.isArray(val)) row.result = JSON.stringify(val);
                    else row.result = String(val ?? '{}');
                  }
                  pi++;
                }
              }
            }
            if (/INSERT INTO logs/i.test(sql)) {
              logs.push({
                id: logNextId++,
                action: statement.bound?.[0],
                details: statement.bound?.[1],
                ip: statement.bound?.[2],
                actor: statement.bound?.[3] || '',
                status: statement.bound?.[4] || '',
                duration_ms: statement.bound?.[5] || 0,
                target_path: statement.bound?.[6] || '',
                error_code: statement.bound?.[7] || '',
                metadata: statement.bound?.[8] || '',
                timestamp: statement.bound?.length >= 10 ? statement.bound?.[9] : Date.now(),
              });
            }
            if (/INSERT INTO trash/i.test(sql)) {
              trashRows.push({
                id: statement.bound?.[0],
                original_key: statement.bound?.[1],
                trash_key: statement.bound?.[2],
                name: statement.bound?.[3],
                kind: statement.bound?.[4],
                size: statement.bound?.[5],
                storage_id: statement.bound?.length >= 8 ? statement.bound?.[6] : 'r2',
                trashed_at: statement.bound?.length >= 8 ? statement.bound?.[7] : statement.bound?.[6],
              });
            }
            if (/INSERT INTO path_passwords/i.test(sql)) {
              const row = {
                path: statement.bound?.[0],
                salt: statement.bound?.[1],
                password_hash: statement.bound?.[2],
                note: statement.bound?.[3],
                show_name: statement.bound?.[4],
                created_at: statement.bound?.[5],
              };
              const idx = protectedRows.findIndex(item => item.path === row.path);
              if (idx >= 0) protectedRows[idx] = row;
              else protectedRows.push(row);
            }
            if (/INSERT INTO file_index/i.test(sql)) {
              const hasObjectKey = statement.bound?.length >= 10;
              const row = {
                path: statement.bound?.[0],
                storage_id: statement.bound?.length >= 9 ? statement.bound?.[1] : 'r2',
                object_key: hasObjectKey ? statement.bound?.[2] : statement.bound?.[0],
                name: hasObjectKey ? statement.bound?.[3] : (statement.bound?.length >= 9 ? statement.bound?.[2] : statement.bound?.[1]),
                parent: hasObjectKey ? statement.bound?.[4] : (statement.bound?.length >= 9 ? statement.bound?.[3] : statement.bound?.[2]),
                kind: hasObjectKey ? statement.bound?.[5] : (statement.bound?.length >= 9 ? statement.bound?.[4] : statement.bound?.[3]),
                size: hasObjectKey ? statement.bound?.[6] : (statement.bound?.length >= 9 ? statement.bound?.[5] : statement.bound?.[4]),
                content_type: hasObjectKey ? statement.bound?.[7] : (statement.bound?.length >= 9 ? statement.bound?.[6] : statement.bound?.[5]),
                uploaded_at: hasObjectKey ? statement.bound?.[8] : (statement.bound?.length >= 9 ? statement.bound?.[7] : statement.bound?.[6]),
                updated_at: hasObjectKey ? statement.bound?.[9] : (statement.bound?.length >= 9 ? statement.bound?.[8] : statement.bound?.[7]),
              };
              const idx = fileIndexRows.findIndex(item => item.path === row.path);
              if (idx >= 0) fileIndexRows[idx] = row;
              else fileIndexRows.push(row);
            }
            if (/INSERT OR REPLACE INTO storage_usage/i.test(sql)) {
              const row = {
                storage_id: statement.bound?.[0] || 'r2',
                object_key: statement.bound?.[1],
                size: Number(statement.bound?.[2] || 0),
              };
              const idx = storageUsageRows.findIndex(item =>
                item.storage_id === row.storage_id && item.object_key === row.object_key
              );
              if (idx >= 0) storageUsageRows[idx] = row;
              else storageUsageRows.push(row);
            }
            if (/INSERT INTO storage_objects/i.test(sql)) {
              const row = {
                id: statement.bound?.[0],
                storage_id: statement.bound?.[1] || 'r2',
                object_key: statement.bound?.[2],
                sha256: statement.bound?.[3],
                size: Number(statement.bound?.[4] || 0),
                content_type: statement.bound?.[5] || '',
                ref_count: 0,
                created_at: Number(statement.bound?.[6] || 0),
                updated_at: Number(statement.bound?.[7] || 0),
              };
              const duplicate = storageObjectRows.find(item =>
                (item.storage_id === row.storage_id && item.object_key === row.object_key)
                || (item.storage_id === row.storage_id && item.sha256 === row.sha256 && Number(item.size || 0) === row.size)
              );
              if (duplicate) throw new Error('UNIQUE constraint failed: storage_objects');
              storageObjectRows.push(row);
            }
            if (/INSERT INTO share_links/i.test(sql)) {
              const hasTargetType = /target_type/i.test(sql);
              const row = {
                token: statement.bound?.[0],
                path: statement.bound?.[1],
                name: statement.bound?.[2],
                size: statement.bound?.[3],
                content_type: statement.bound?.[4],
                target_type: hasTargetType ? statement.bound?.[5] || 'file' : 'file',
                allow_preview: hasTargetType ? statement.bound?.[6] : statement.bound?.[5],
                allow_download: hasTargetType ? statement.bound?.[7] : statement.bound?.[6],
                expires_at: hasTargetType ? statement.bound?.[8] : statement.bound?.[7],
                max_downloads: hasTargetType ? statement.bound?.[9] : statement.bound?.[8],
                download_count: 0,
                password_salt: statement.bound?.[hasTargetType ? 10 : 9] || '',
                password_hash: statement.bound?.[hasTargetType ? 11 : 10] || '',
                expired_notified_at: 0,
                created_at: statement.bound?.[hasTargetType ? 12 : 11] ?? statement.bound?.[hasTargetType ? 11 : 10] ?? statement.bound?.[hasTargetType ? 9 : 8],
                last_accessed_at: 0,
                last_access_ip: '',
              };
              const idx = shareRows.findIndex(item => item.token === row.token);
              if (idx >= 0) shareRows[idx] = row;
              else shareRows.push(row);
            }
            if (/INSERT INTO webhook_deliveries/i.test(sql)) {
              const hasRetryContext = statement.bound?.length >= 11;
              webhookDeliveryRows.push({
                id: webhookDeliveryNextId++,
                event: statement.bound?.[0],
                endpoint: statement.bound?.[1],
                url: statement.bound?.[2],
                ok: statement.bound?.[3],
                status: statement.bound?.[4],
                error: statement.bound?.[5],
                duration_ms: statement.bound?.[6],
                payload: hasRetryContext ? statement.bound?.[7] : '{}',
                endpoint_config: hasRetryContext ? statement.bound?.[8] : '{}',
                retry_of: hasRetryContext ? statement.bound?.[9] : 0,
                created_at: hasRetryContext ? statement.bound?.[10] : statement.bound?.[7],
              });
            }
            if (/INSERT INTO system_warnings/i.test(sql)) {
              systemWarningRows.push({
                id: systemWarningNextId++,
                source: statement.bound?.[0],
                message: statement.bound?.[1],
                level: statement.bound?.length >= 4 ? statement.bound?.[2] : 'warning',
                acknowledged_at: 0,
                created_at: statement.bound?.length >= 4 ? statement.bound?.[3] : statement.bound?.[2],
              });
            }
            if (/INSERT INTO file_tasks/i.test(sql)) {
              taskRows.push({
                id: statement.bound?.[0],
                type: statement.bound?.[1],
                status: statement.bound?.[2],
                total: statement.bound?.[3],
                completed: 0,
                failed: 0,
                payload: statement.bound?.[4],
                result: statement.bound?.[5] || '{}',
                error: '',
                created_at: statement.bound?.[6],
                updated_at: statement.bound?.[7],
                finished_at: 0,
              });
            }
            if (/INSERT INTO notifications/i.test(sql)) {
              notificationRows.push({
                id: notificationNextId++,
                event: statement.bound?.[0],
                message: statement.bound?.[1],
                path: statement.bound?.[2] || '',
                read: 0,
                created_at: statement.bound?.[3],
              });
            }
            if (/INSERT INTO path_access_attempts/i.test(sql)) {
              const row = {
                path: statement.bound?.[0],
                ip: statement.bound?.[1],
                attempts: 1,
                last_attempt: statement.bound?.[2],
              };
              const idx = pathAttemptRows.findIndex(item => item.path === row.path && item.ip === row.ip);
              if (idx >= 0) {
                pathAttemptRows[idx].attempts += 1;
                pathAttemptRows[idx].last_attempt = row.last_attempt;
              } else {
                pathAttemptRows.push(row);
              }
            }
            if (/INSERT INTO login_attempts/i.test(sql)) {
              const row = {
                ip: statement.bound?.[0],
                attempts: 1,
                last_attempt: statement.bound?.[1],
              };
              const idx = loginAttemptRows.findIndex(item => item.ip === row.ip);
              if (idx >= 0) {
                loginAttemptRows[idx].attempts += 1;
                loginAttemptRows[idx].last_attempt = row.last_attempt;
              } else {
                loginAttemptRows.push(row);
              }
            }
            if (/INSERT OR REPLACE INTO login_alerts/i.test(sql)) {
              const row = {
                key: statement.bound?.[0],
                last_alert: statement.bound?.[1],
              };
              const idx = loginAlertRows.findIndex(item => item.key === row.key);
              if (idx >= 0) loginAlertRows[idx] = row;
              else loginAlertRows.push(row);
            }
            if (/INSERT OR REPLACE INTO download_bursts/i.test(sql)) {
              const row = {
                key: statement.bound?.[0],
                request_count: statement.bound?.[1],
                window_start: statement.bound?.[2],
                last_alert: statement.bound?.[3],
                blocked_until: statement.bound?.[4],
                sample_paths: statement.bound?.[5],
              };
              const idx = downloadBurstRows.findIndex(item => item.key === row.key);
              if (idx >= 0) downloadBurstRows[idx] = row;
              else downloadBurstRows.push(row);
            }
            if (/UPDATE download_bursts SET request_count = \?/i.test(sql)) {
              const key = statement.bound?.[4];
              const row = downloadBurstRows.find(item => item.key === key);
              if (row) {
                row.request_count = statement.bound?.[0];
                row.last_alert = statement.bound?.[1];
                row.blocked_until = statement.bound?.[2];
                row.sample_paths = statement.bound?.[3];
              }
            }
            if (/UPDATE file_index SET object_key = \?, updated_at = \? WHERE storage_id = \? AND COALESCE\(NULLIF\(object_key, ''\), path\) = \?/i.test(sql)) {
              const [nextObjectKey, updatedAt, storageId, oldObjectKey] = statement.bound || [];
              for (const row of fileIndexRows) {
                if ((row.storage_id || 'r2') === storageId && (row.object_key || row.path) === oldObjectKey) {
                  row.object_key = nextObjectKey;
                  row.updated_at = updatedAt;
                }
              }
            }
            if (/UPDATE storage_objects SET ref_count = ref_count \+ \?/i.test(sql)) {
              const [delta, updatedAt, storageId, objectKey] = statement.bound || [];
              const row = storageObjectRows.find(item =>
                item.storage_id === storageId && item.object_key === objectKey
              );
              if (row) {
                row.ref_count = Number(row.ref_count || 0) + Number(delta || 0);
                row.updated_at = Number(updatedAt || row.updated_at || 0);
              }
            }
            if (/UPDATE storage_objects SET ref_count = CASE WHEN ref_count > \?/i.test(sql)) {
              const [amount, _amount2, updatedAt, storageId, objectKey] = statement.bound || [];
              const row = storageObjectRows.find(item =>
                item.storage_id === storageId && item.object_key === objectKey
              );
              if (row) {
                row.ref_count = Number(row.ref_count || 0) > Number(amount || 0)
                  ? Number(row.ref_count || 0) - Number(amount || 0)
                  : 0;
                row.updated_at = Number(updatedAt || row.updated_at || 0);
              }
            }
            if (/UPDATE notifications SET read = 1 WHERE id = \?/i.test(sql)) {
              const row = notificationRows.find(item => item.id === statement.bound?.[0]);
              if (row) row.read = 1;
            }
            if (/UPDATE notifications SET read = 1 WHERE read = 0/i.test(sql)) {
              for (const row of notificationRows) row.read = 1;
            }
            if (/INSERT OR REPLACE INTO settings/i.test(sql)) {
              settingsRows.set('trash_retention_days', statement.bound?.[0]);
            }
            if (/INSERT OR REPLACE INTO kv_config/i.test(sql)) {
              kvRows.set(statement.bound?.[0], statement.bound?.[1]);
            }
            if (/INSERT OR IGNORE INTO settings/i.test(sql)) {
              settingsRows.set(statement.bound?.[0], 'hidden');
            }
            if (/DELETE FROM settings WHERE key = \?/i.test(sql)) {
              settingsRows.delete(statement.bound?.[0]);
            }
            if (/DELETE FROM trash WHERE id = \?/i.test(sql)) {
              const id = statement.bound?.[0];
              const idx = trashRows.findIndex(row => row.id === id);
              if (idx >= 0) trashRows.splice(idx, 1);
            }
            if (/DELETE FROM path_passwords WHERE path = \?/i.test(sql)) {
              const path = statement.bound?.[0];
              const idx = protectedRows.findIndex(row => row.path === path);
              if (idx >= 0) protectedRows.splice(idx, 1);
            }
            if (/DELETE FROM path_access_attempts WHERE path = \? AND ip = \?/i.test(sql)) {
              const [path, ip] = statement.bound || [];
              const idx = pathAttemptRows.findIndex(row => row.path === path && row.ip === ip);
              if (idx >= 0) pathAttemptRows.splice(idx, 1);
            }
            if (/DELETE FROM login_attempts WHERE ip = \?/i.test(sql)) {
              const ip = statement.bound?.[0];
              const idx = loginAttemptRows.findIndex(row => row.ip === ip);
              if (idx >= 0) loginAttemptRows.splice(idx, 1);
            }
            if (/DELETE FROM kv_config WHERE key = 'webhooks'/i.test(sql)) {
              kvRows.delete('webhooks');
            }
            if (/DELETE FROM file_index WHERE path = \?/i.test(sql)) {
              const path = statement.bound?.[0];
              const idx = fileIndexRows.findIndex(row => row.path === path);
              if (idx >= 0) fileIndexRows.splice(idx, 1);
            }
            if (/DELETE FROM storage_usage WHERE storage_id = \? AND object_key = \?/i.test(sql)) {
              const [storageId, objectKey] = statement.bound || [];
              const idx = storageUsageRows.findIndex(row =>
                row.storage_id === storageId && row.object_key === objectKey
              );
              if (idx >= 0) storageUsageRows.splice(idx, 1);
            }
            if (/DELETE FROM storage_objects WHERE storage_id = \? AND object_key = \?/i.test(sql)) {
              const [storageId, objectKey] = statement.bound || [];
              const idx = storageObjectRows.findIndex(row =>
                row.storage_id === storageId && row.object_key === objectKey
              );
              if (idx >= 0) storageObjectRows.splice(idx, 1);
            }
            if (/DELETE FROM share_links WHERE token = \?/i.test(sql)) {
              const token = statement.bound?.[0];
              const idx = shareRows.findIndex(row => row.token === token);
              if (idx >= 0) shareRows.splice(idx, 1);
            }
            if (/DELETE FROM share_links WHERE token IN/i.test(sql)) {
              const tokens = new Set((statement.bound || []).map(t => String(t)));
              for (let i = shareRows.length - 1; i >= 0; i--) {
                if (tokens.has(String(shareRows[i].token))) { shareRows.splice(i, 1); changes++; }
              }
            }
            if (/UPDATE share_links SET last_accessed_at = \? WHERE token = \?/i.test(sql)) {
              const row = shareRows.find(item => item.token === statement.bound?.[1]);
              if (row) row.last_accessed_at = statement.bound?.[0];
            }
            if (/UPDATE share_links SET last_accessed_at = \?, last_access_ip = \? WHERE token = \?/i.test(sql)) {
              const row = shareRows.find(item => item.token === statement.bound?.[2]);
              if (row) {
                row.last_accessed_at = statement.bound?.[0];
                row.last_access_ip = statement.bound?.[1] || '';
              }
            }
            if (/UPDATE share_links SET expired_notified_at = \? WHERE token = \?/i.test(sql)) {
              const row = shareRows.find(item => item.token === statement.bound?.[1]);
              if (row) row.expired_notified_at = statement.bound?.[0];
            }
            if (/UPDATE share_links SET download_count = download_count \+ 1/i.test(sql)) {
              const row = shareRows.find(item => item.token === (statement.bound?.[2] ?? statement.bound?.[1]));
              if (row) {
                row.download_count = Number(row.download_count || 0) + 1;
                row.last_accessed_at = statement.bound?.[0];
                if (statement.bound?.length >= 3) row.last_access_ip = statement.bound?.[1] || '';
              }
            }
            if (/DELETE FROM file_index WHERE path = \? OR path LIKE \?/i.test(sql)) {
              const path = statement.bound?.[0];
              const prefix = String(statement.bound?.[1] || '').replace(/%$/, '');
              for (let i = fileIndexRows.length - 1; i >= 0; i--) {
                if (fileIndexRows[i].path === path || fileIndexRows[i].path.startsWith(prefix)) { fileIndexRows.splice(i, 1); changes++; }
              }
            }
            if (/DELETE FROM file_index$/i.test(sql.trim())) {
              changes = fileIndexRows.length;
              fileIndexRows.length = 0;
            }
            if (/DELETE FROM path_access_attempts$/i.test(sql.trim())) {
              changes = pathAttemptRows.length;
              pathAttemptRows.length = 0;
            }
            if (/DELETE FROM logs WHERE timestamp < \?/i.test(sql)) {
              const cutoff = Number(statement.bound?.[0] || 0);
              for (let i = logs.length - 1; i >= 0; i--) {
                if (Number(logs[i].timestamp || 0) < cutoff) { logs.splice(i, 1); changes++; }
              }
            }
            if (/DELETE FROM logs WHERE id\s*[<]=?\s*\?/i.test(sql)) {
              const cutoffId = Number(statement.bound?.[0] || 0);
              const comparator = /id\s*<=/i.test(sql)
                ? (id) => Number(id || 0) <= cutoffId
                : (id) => Number(id || 0) < cutoffId;
              for (let i = logs.length - 1; i >= 0; i--) {
                if (comparator(logs[i].id)) { logs.splice(i, 1); changes++; }
              }
            }
            if (/DELETE FROM logs WHERE id NOT IN/i.test(sql)) {
              const limit = Number(statement.bound?.[0] || 2000);
              const keep = new Set(materializedLogs().slice(0, limit).map(row => row.id));
              for (let i = logs.length - 1; i >= 0; i--) {
                if (!keep.has(logs[i].id)) { logs.splice(i, 1); changes++; }
              }
            }
            if (/DELETE FROM download_bursts WHERE window_start < \? AND last_alert < \?/i.test(sql)) {
              const [windowCutoff, alertCutoff] = statement.bound || [];
              for (let i = downloadBurstRows.length - 1; i >= 0; i--) {
                const row = downloadBurstRows[i];
                if (Number(row.window_start || 0) < windowCutoff && Number(row.last_alert || 0) < alertCutoff) { downloadBurstRows.splice(i, 1); changes++; }
              }
            }
            if (/DELETE FROM webhook_deliveries WHERE created_at < \?/i.test(sql)) {
              const cutoff = Number(statement.bound?.[0] || 0);
              for (let i = webhookDeliveryRows.length - 1; i >= 0; i--) {
                if (Number(webhookDeliveryRows[i].created_at || 0) < cutoff) { webhookDeliveryRows.splice(i, 1); changes++; }
              }
            }
            if (/DELETE FROM webhook_deliveries WHERE id NOT IN/i.test(sql)) {
              const limit = Number(statement.bound?.[0] || 200);
              const keep = new Set(
                [...webhookDeliveryRows]
                  .sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0) || Number(b.id || 0) - Number(a.id || 0))
                  .slice(0, limit)
                  .map(row => row.id)
              );
              for (let i = webhookDeliveryRows.length - 1; i >= 0; i--) {
                if (!keep.has(webhookDeliveryRows[i].id)) { webhookDeliveryRows.splice(i, 1); changes++; }
              }
            }
            if (/DELETE FROM system_warnings WHERE created_at < \?/i.test(sql)) {
              const cutoff = Number(statement.bound?.[0] || 0);
              for (let i = systemWarningRows.length - 1; i >= 0; i--) {
                if (Number(systemWarningRows[i].created_at || 0) < cutoff) { systemWarningRows.splice(i, 1); changes++; }
              }
            }
            if (/DELETE FROM system_warnings WHERE id\s*[<]=?\s*\?/i.test(sql)) {
              const cutoffId = Number(statement.bound?.[0] || 0);
              const comparator = /id\s*<=/i.test(sql)
                ? (id) => Number(id || 0) <= cutoffId
                : (id) => Number(id || 0) < cutoffId;
              for (let i = systemWarningRows.length - 1; i >= 0; i--) {
                if (comparator(systemWarningRows[i].id)) { systemWarningRows.splice(i, 1); changes++; }
              }
            }
            if (/DELETE FROM system_warnings WHERE id NOT IN/i.test(sql)) {
              const limit = Number(statement.bound?.[0] || 100);
              const keep = new Set(
                [...systemWarningRows]
                  .sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0) || Number(b.id || 0) - Number(a.id || 0))
                  .slice(0, limit)
                  .map(row => row.id)
              );
              for (let i = systemWarningRows.length - 1; i >= 0; i--) {
                if (!keep.has(systemWarningRows[i].id)) { systemWarningRows.splice(i, 1); changes++; }
              }
            }
            if (/^DELETE FROM system_warnings$/i.test(sql.trim())) {
              changes = systemWarningRows.length;
              systemWarningRows.length = 0;
            }
            if (/UPDATE system_warnings SET acknowledged_at = \? WHERE acknowledged_at = 0/i.test(sql)) {
              const now = Number(statement.bound?.[0] || Date.now());
              for (const row of systemWarningRows) {
                if (!Number(row.acknowledged_at || 0)) row.acknowledged_at = now;
              }
            }
            if (/DELETE FROM file_tasks WHERE status NOT IN \('queued', 'running'\) AND finished_at > 0 AND finished_at < \?/i.test(sql)) {
              const cutoff = Number(statement.bound?.[0] || 0);
              for (let i = taskRows.length - 1; i >= 0; i--) {
                const row = taskRows[i];
                if (!['queued', 'running'].includes(row.status) && Number(row.finished_at || 0) > 0 && Number(row.finished_at || 0) < cutoff) { taskRows.splice(i, 1); changes++; }
              }
            }
            if (/^DELETE FROM file_tasks WHERE status NOT IN \('queued', 'running'\)$/i.test(sql.trim())) {
              for (let i = taskRows.length - 1; i >= 0; i--) {
                if (!['queued', 'running'].includes(taskRows[i].status)) { taskRows.splice(i, 1); changes++; }
              }
            }
            if (/DELETE FROM file_tasks\s+WHERE status NOT IN \('queued', 'running'\)\s+AND id NOT IN/i.test(sql)) {
              const limit = Number(statement.bound?.[0] || 100);
              const completed = taskRows
                .filter(row => !['queued', 'running'].includes(row.status))
                .sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0))
                .slice(0, limit);
              const keep = new Set(completed.map(row => row.id));
              for (let i = taskRows.length - 1; i >= 0; i--) {
                if (!['queued', 'running'].includes(taskRows[i].status) && !keep.has(taskRows[i].id)) { taskRows.splice(i, 1); changes++; }
              }
            }
            return { meta: { changes } };
          },
          async first() {
            if (/SELECT \* FROM storage_objects WHERE storage_id = \? AND sha256 = \? AND size = \?/i.test(sql)) {
              const [storageId, sha256, size] = statement.bound || [];
              return storageObjectRows.find(row =>
                row.storage_id === storageId
                && row.sha256 === sha256
                && Number(row.size || 0) === Number(size || 0)
              ) || null;
            }
            if (/SELECT \* FROM storage_objects WHERE storage_id = \? AND object_key = \?/i.test(sql)) {
              const [storageId, objectKey] = statement.bound || [];
              return storageObjectRows.find(row =>
                row.storage_id === storageId && row.object_key === objectKey
              ) || null;
            }
            if (/SELECT COALESCE\(SUM\(size\), 0\) AS total FROM storage_usage WHERE storage_id = \?/i.test(sql)) {
              const storageId = statement.bound?.[0] || 'r2';
              if (!storageUsageRows.length) return null;
              return {
                total: storageUsageRows
                  .filter(row => row.storage_id === storageId)
                  .reduce((sum, row) => sum + Number(row.size || 0), 0),
              };
            }
            if (/SELECT COUNT\(\*\) as cnt FROM storage_usage/i.test(sql)) {
              return { cnt: storageUsageRows.length };
            }
            if (/SELECT COUNT\(\*\) as count FROM file_index WHERE storage_id = \? AND COALESCE\(NULLIF\(object_key, ''\), path\) = \?/i.test(sql)) {
              const [storageId, objectKey] = statement.bound || [];
              return {
                count: fileIndexRows.filter(row =>
                  (row.storage_id || 'r2') === storageId
                  && (row.object_key || row.path) === objectKey
                ).length,
              };
            }
            if (/SELECT COALESCE\(SUM\(size\), 0\) AS total FROM \(SELECT storage_id, COALESCE\(NULLIF\(object_key, ''\), path\) AS object_key/i.test(sql)) {
              const storageId = /WHERE storage_id = \?/i.test(sql) ? statement.bound?.[0] : '';
              const rows = storageId ? fileIndexRows.filter(row => (row.storage_id || 'r2') === storageId) : fileIndexRows;
              const objects = new Map();
              for (const row of rows) {
                const key = `${row.storage_id || 'r2'}\0${row.object_key || row.path}`;
                objects.set(key, Math.max(Number(objects.get(key) || 0), Number(row.size || 0)));
              }
              return { total: [...objects.values()].reduce((sum, size) => sum + size, 0) };
            }
            if (/SELECT COUNT\(\*\) as count FROM file_index/i.test(sql)) return { count: fileIndexRows.length };
            if (/SELECT COUNT\(\*\) as count FROM path_access_attempts/i.test(sql)) return { count: pathAttemptRows.length };
            if (/INSERT INTO login_attempts.*RETURNING\s+attempts/i.test(sql)) {
              const ip = statement.bound?.[0];
              const ts = statement.bound?.[1];
              const row = loginAttemptRows.find(item => item.ip === ip);
              if (row) {
                row.attempts += 1;
                row.last_attempt = ts;
                return { attempts: row.attempts };
              }
              loginAttemptRows.push({ ip, attempts: 1, last_attempt: ts });
              return { attempts: 1 };
            }
            if (/SELECT attempts, last_attempt FROM login_attempts WHERE ip = \?/i.test(sql)) {
              const ip = statement.bound?.[0];
              return loginAttemptRows.find(row => row.ip === ip) || null;
            }
            if (/SELECT last_alert FROM login_alerts WHERE key = \?/i.test(sql)) {
              return loginAlertRows.find(row => row.key === statement.bound?.[0]) || null;
            }
            if (/SELECT attempts, last_attempt FROM path_access_attempts WHERE path = \? AND ip = \?/i.test(sql)) {
              const [path, ip] = statement.bound || [];
              return pathAttemptRows.find(row => row.path === path && row.ip === ip) || null;
            }
            if (/SELECT request_count, window_start, last_alert, sample_paths FROM download_bursts WHERE key = \?/i.test(sql)) {
              return downloadBurstRows.find(row => row.key === statement.bound?.[0]) || null;
            }
            if (/SELECT request_count, window_start, last_alert, blocked_until, sample_paths FROM download_bursts WHERE key = \?/i.test(sql)) {
              return downloadBurstRows.find(row => row.key === statement.bound?.[0]) || null;
            }
            if (/SELECT blocked_until FROM download_bursts WHERE key = \?/i.test(sql)) {
              return downloadBurstRows.find(row => row.key === statement.bound?.[0]) || null;
            }
            if (/SELECT COUNT\(\*\) as count FROM trash/i.test(sql)) return { count: filteredTrashRows(statement.bound || []).length };
            if (/SELECT \* FROM trash WHERE id = \?/i.test(sql)) return trashRows.find(row => row.id === statement.bound?.[0]) || null;
            if (/SELECT \* FROM share_links WHERE token = \?/i.test(sql)) return shareRows.find(row => row.token === statement.bound?.[0]) || null;
            if (/SELECT \* FROM file_tasks WHERE id = \?/i.test(sql)) return taskRows.find(row => row.id === statement.bound?.[0]) || null;
            if (/SELECT \* FROM webhook_deliveries WHERE id = \?/i.test(sql)) {
              return webhookDeliveryRows.find(row => row.id === Number(statement.bound?.[0])) || null;
            }
            if (/SELECT COUNT\(\*\) as count FROM file_tasks WHERE status NOT IN \('queued', 'running'\)/i.test(sql)) {
              return { count: taskRows.filter(row => !['queued', 'running'].includes(row.status)).length };
            }
            if (/SELECT COUNT\(\*\) as count FROM file_tasks\s+WHERE \(status = 'failed' OR failed > 0\)/i.test(sql)) {
              const [finishedSince = 0, updatedSince = finishedSince] = statement.bound || [];
              return {
                count: taskRows.filter(row =>
                  (row.status === 'failed' || Number(row.failed || 0) > 0)
                  && (Number(row.finished_at || 0) >= Number(finishedSince || 0)
                    || (Number(row.finished_at || 0) === 0 && Number(row.updated_at || 0) >= Number(updatedSince || 0)))
                ).length,
              };
            }
            if (/SELECT COUNT\(\*\) as count FROM file_tasks/i.test(sql)) return { count: taskRows.length };
            if (/SELECT COUNT\(\*\) as count FROM logs/i.test(sql)) return { count: filteredLogs(sql, statement.bound || []).length };
            if (/SELECT COUNT\(\*\) as count FROM webhook_deliveries WHERE ok = 0/i.test(sql)) {
              return { count: webhookDeliveryRows.filter(row => Number(row.ok || 0) === 0).length };
            }
            if (/SELECT COUNT\(\*\) as count FROM system_warnings WHERE acknowledged_at = 0/i.test(sql)) {
              return { count: systemWarningRows.filter(row => !Number(row.acknowledged_at || 0)).length };
            }
            if (/SELECT COUNT\(\*\) as count FROM notifications WHERE read = 0/i.test(sql)) {
              return { count: notificationRows.filter(row => !Number(row.read || 0)).length };
            }
            if (/SELECT COUNT\(\*\) as count FROM system_warnings/i.test(sql)) return { count: systemWarningRows.length };
            if (/SELECT value FROM settings WHERE key = 'trash_retention_days'/i.test(sql)) {
              const value = settingsRows.get('trash_retention_days');
              return value == null ? null : { value };
            }
            if (/SELECT value FROM kv_config WHERE key = \?/i.test(sql)) {
              const value = kvRows.get(statement.bound?.[0]);
              return value == null ? null : { value };
            }
            if (/SELECT storage_id FROM file_index WHERE path = \?/i.test(sql)) {
              const row = fileIndexRows.find(item => item.path === statement.bound?.[0]);
              return row ? { storage_id: row.storage_id || 'r2' } : null;
            }
            if (/SELECT storage_id, COALESCE\(NULLIF\(object_key, ''\), path\) AS object_key FROM file_index WHERE path = \?/i.test(sql)) {
              const row = fileIndexRows.find(item => item.path === statement.bound?.[0]);
              return row ? {
                storage_id: row.storage_id || 'r2',
                object_key: row.object_key || row.path,
              } : null;
            }
            if (/SELECT \* FROM file_index WHERE path = \?/i.test(sql)) {
              return fileIndexRows.find(item => item.path === statement.bound?.[0]) || null;
            }
            if (/SELECT COALESCE\(SUM\(size\), 0\) AS total FROM file_index/i.test(sql)) {
              const storageId = /WHERE storage_id = \?/i.test(sql) ? statement.bound?.[0] : '';
              const rows = storageId ? fileIndexRows.filter(row => (row.storage_id || 'r2') === storageId) : fileIndexRows;
              if (/GROUP BY storage_id, COALESCE\(NULLIF\(object_key, ''\), path\)/i.test(sql)) {
                const objects = new Map();
                for (const row of rows) {
                  const key = `${row.storage_id || 'r2'}\0${row.object_key || row.path}`;
                  objects.set(key, Math.max(Number(objects.get(key) || 0), Number(row.size || 0)));
                }
                return { total: [...objects.values()].reduce((sum, size) => sum + size, 0) };
              }
              return { total: rows.reduce((sum, row) => sum + Number(row.size || 0), 0) };
            }
            if (/SELECT COUNT\(\*\) as count, COALESCE\(SUM\(size\), 0\) as totalSize, COALESCE\(MAX\(updated_at\), 0\) as latestUpdatedAt FROM file_index/i.test(sql)) {
              return {
                count: fileIndexRows.length,
                totalSize: fileIndexRows.reduce((sum, row) => sum + Number(row.size || 0), 0),
                latestUpdatedAt: fileIndexRows.reduce((max, row) => Math.max(max, Number(row.updated_at || 0)), 0),
              };
            }
            if (/SELECT value FROM kv_config WHERE key = 'webhooks'/i.test(sql)) {
              const value = kvRows.get('webhooks');
              return value == null ? null : { value };
            }
            if (/SELECT id FROM logs ORDER BY id DESC LIMIT 1 OFFSET \?/i.test(sql)) {
              const offset = Number(statement.bound?.[0] || 0);
              const sorted = [...logs].sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
              const row = sorted[offset];
              return row ? { id: row.id } : null;
            }
            if (/SELECT id FROM system_warnings ORDER BY id DESC LIMIT 1 OFFSET \?/i.test(sql)) {
              const offset = Number(statement.bound?.[0] || 0);
              const sorted = [...systemWarningRows]
                .sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0) || Number(b.id || 0) - Number(a.id || 0));
              const row = sorted[offset];
              return row ? { id: row.id } : null;
            }
            return null;
          },
          async all() {
            if (/SELECT \* FROM storage_objects ORDER BY/i.test(sql)) {
              return { results: [...storageObjectRows] };
            }
            if (/SELECT \* FROM file_index WHERE \(lower\(name\) LIKE \? OR lower\(path\) LIKE \?\)/i.test(sql)) {
              const like = String(statement.bound?.[0] || '').replace(/%/g, '');
              let rows = fileIndexRows.filter(row =>
                row.name.toLowerCase().includes(like)
                || row.path.toLowerCase().includes(like)
              );
              let pi = 2;
              if (/path = \? OR path LIKE \?/i.test(sql)) {
                const scope = statement.bound?.[pi++];
                const prefix = String(statement.bound?.[pi++] || '').replace(/%$/, '');
                rows = rows.filter(row => row.path === scope || row.path.startsWith(prefix));
              }
              if (/path > \?/i.test(sql)) {
                const keysetCursor = statement.bound?.[pi++] || '';
                if (keysetCursor) rows = rows.filter(row => row.path > keysetCursor);
              }
              const hiddenCount = (sql.match(/path NOT LIKE \? AND path != \?/gi) || []).length;
              for (let h = 0; h < hiddenCount; h++) {
                const val = String(statement.bound?.[pi++] || '');
                pi++;
                if (val.endsWith('/%')) {
                  const prefix = val.slice(0, -2);
                  rows = rows.filter(row => !String(row.path || '').startsWith(prefix));
                }
              }
              if (/kind = \?/i.test(sql) && pi < (statement.bound?.length || 0)) {
                const kind = statement.bound?.[pi++];
                if (kind && kind !== 'all' && kind !== 'file') rows = rows.filter(row => row.kind === kind);
              }
              if (/size >= \?/i.test(sql) && pi < (statement.bound?.length || 0)) {
                const min = Number(statement.bound?.[pi++]);
                if (Number.isFinite(min)) rows = rows.filter(row => Number(row.size || 0) >= min);
              }
              if (/size <= \?/i.test(sql) && pi < (statement.bound?.length || 0)) {
                const max = Number(statement.bound?.[pi++]);
                if (Number.isFinite(max)) rows = rows.filter(row => Number(row.size || 0) <= max);
              }
              if (/uploaded_at >= \?/i.test(sql) && pi < (statement.bound?.length || 0)) {
                const from = Number(statement.bound?.[pi++]);
                if (Number.isFinite(from)) rows = rows.filter(row => Number(row.uploaded_at || row.updated_at || 0) >= from);
              }
              if (/uploaded_at <= \?/i.test(sql) && pi < (statement.bound?.length || 0)) {
                const to = Number(statement.bound?.[pi++]);
                if (Number.isFinite(to)) rows = rows.filter(row => Number(row.uploaded_at || row.updated_at || 0) <= to);
              }
              let limit, offset;
              if (/OFFSET \?/i.test(sql)) {
                limit = statement.bound?.[statement.bound.length - 2] ?? rows.length;
                offset = statement.bound?.[statement.bound.length - 1] ?? 0;
              } else {
                limit = statement.bound?.[statement.bound.length - 1] ?? rows.length;
                offset = 0;
              }
              return { results: rows.sort((a, b) => a.path.localeCompare(b.path)).slice(offset, offset + limit) };
            }
            if (/SELECT \* FROM file_index WHERE parent = \?/i.test(sql)) {
              const parent = statement.bound?.[0] || '';
              return { results: fileIndexRows.filter(row => row.parent === parent).sort((a, b) => String(a.name).localeCompare(String(b.name))) };
            }
            if (/SELECT \* FROM file_index ORDER BY path ASC/i.test(sql)) {
              return { results: [...fileIndexRows].sort((a, b) => String(a.path).localeCompare(String(b.path))) };
            }
            if (/SELECT \* FROM file_index WHERE path = \? OR path LIKE \?/i.test(sql)) {
              const path = statement.bound?.[0];
              const prefix = String(statement.bound?.[1] || '').replace(/%$/, '');
              return {
                results: fileIndexRows
                  .filter(row => row.path === path || String(row.path || '').startsWith(prefix))
                  .sort((a, b) => String(a.path).localeCompare(String(b.path))),
              };
            }
            if (/SELECT DISTINCT parent FROM file_index WHERE parent LIKE \?/i.test(sql)) {
              const prefix = String(statement.bound?.[0] || '').replace(/%$/, '');
              const parents = new Set(fileIndexRows.map(row => String(row.parent || '')).filter(parent => parent.startsWith(prefix)));
              return { results: [...parents].sort((a, b) => a.localeCompare(b)).slice(0, 5000).map(parent => ({ parent })) };
            }
            if (/SELECT DISTINCT parent FROM file_index WHERE parent != ''/i.test(sql)) {
              const parents = new Set(fileIndexRows.map(row => String(row.parent || '')).filter(Boolean));
              return { results: [...parents].sort((a, b) => a.localeCompare(b)).slice(0, 5000).map(parent => ({ parent })) };
            }
            if (/SELECT key FROM settings WHERE value = 'hidden'/i.test(sql)) {
              return {
                results: [...settingsRows.entries()]
                  .filter(([, value]) => value === 'hidden')
                  .map(([key]) => ({ key })),
              };
            }
            if (/SELECT \* FROM share_links WHERE/i.test(sql)) {
              const expiryCutoff = statement.bound?.[0] ?? Date.now();
              return {
                results: shareRows
                  .filter(row => (Number(row.expires_at || 0) > 0 && Number(row.expires_at || 0) <= expiryCutoff)
                    || (Number(row.max_downloads || 0) > 0 && Number(row.download_count || 0) >= Number(row.max_downloads || 0)))
              };
            }
            if (/SELECT \* FROM share_links ORDER BY created_at DESC/i.test(sql)) {
              return { results: [...shareRows].sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0)) };
            }
            if (/SELECT \* FROM webhook_deliveries ORDER BY created_at DESC/i.test(sql)) {
              return {
                results: [...webhookDeliveryRows]
                  .sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0) || Number(b.id || 0) - Number(a.id || 0))
                  .slice(0, 20)
              };
            }
            if (/SELECT \* FROM file_tasks ORDER BY created_at DESC LIMIT \?/i.test(sql)) {
              const limit = Number(statement.bound?.[0] || 20);
              return { results: [...taskRows].sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0)).slice(0, limit) };
            }
            if (/SELECT \* FROM notifications ORDER BY created_at DESC LIMIT \?/i.test(sql)) {
              const limit = Number(statement.bound?.[0] || 20);
              return { results: [...notificationRows].sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0)).slice(0, limit) };
            }
            if (/SELECT \* FROM system_warnings WHERE acknowledged_at = 0 ORDER BY created_at DESC/i.test(sql)) {
              return {
                results: [...systemWarningRows]
                  .filter(row => !Number(row.acknowledged_at || 0))
                  .sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0) || Number(b.id || 0) - Number(a.id || 0))
                  .slice(0, 10)
              };
            }
            if (/SELECT \* FROM system_warnings ORDER BY created_at DESC/i.test(sql)) {
              return {
                results: [...systemWarningRows]
                  .sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0) || Number(b.id || 0) - Number(a.id || 0))
                  .slice(0, 10)
              };
            }
            if (/SELECT kind, COUNT\(\*\) as count, SUM\(size\) as size FROM file_index GROUP BY kind/i.test(sql)) {
              const byKind = {};
              for (const row of fileIndexRows) {
                if (!byKind[row.kind]) byKind[row.kind] = { kind: row.kind, count: 0, size: 0 };
                byKind[row.kind].count++;
                byKind[row.kind].size += Number(row.size || 0);
              }
              return { results: Object.values(byKind) };
            }
            if (/SELECT COUNT\(\*\) as count, SUM\(size\) as totalSize FROM file_index/i.test(sql)) {
              const totalSize = fileIndexRows.reduce((sum, r) => sum + Number(r.size || 0), 0);
              return { results: [{ count: fileIndexRows.length, totalSize }] };
            }
            if (/SELECT path, size, uploaded_at, updated_at FROM file_index ORDER BY uploaded_at DESC/i.test(sql)) {
              return { results: [...fileIndexRows].sort((a, b) => b.uploaded_at - a.uploaded_at) };
            }
            if (/SELECT \* FROM file_index ORDER BY uploaded_at DESC/i.test(sql)) {
              return { results: [...fileIndexRows].sort((a, b) => b.uploaded_at - a.uploaded_at) };
            }
            if (/SELECT path, salt, password_hash, note, show_name, created_at FROM path_passwords/i.test(sql)) {
              return { results: [...protectedRows].sort((a, b) => a.path.localeCompare(b.path)) };
            }
            if (/SELECT \* FROM trash ORDER BY trashed_at DESC/i.test(sql)) {
              const size = statement.bound?.[0] ?? 20;
              const offset = statement.bound?.[1] ?? 0;
              return { results: [...trashRows].sort((a, b) => b.trashed_at - a.trashed_at).slice(offset, offset + size) };
            }
            if (/SELECT \* FROM trash WHERE trashed_at < \? ORDER BY trashed_at DESC/i.test(sql)) {
              const cutoff = statement.bound?.[0] ?? 0;
              return { results: trashRows.filter(row => row.trashed_at < cutoff).sort((a, b) => b.trashed_at - a.trashed_at) };
            }
            if (/SELECT \* FROM trash WHERE id IN/i.test(sql)) {
              const ids = new Set(statement.bound || []);
              return { results: trashRows.filter(row => ids.has(row.id)) };
            }
            if (/SELECT \* FROM trash WHERE/i.test(sql)) {
              const bound = statement.bound || [];
              const size = bound[bound.length - 2] ?? 20;
              const offset = bound[bound.length - 1] ?? 0;
              return { results: filteredTrashRows(bound.slice(0, -2)).sort((a, b) => b.trashed_at - a.trashed_at).slice(offset, offset + size) };
            }
            if (/SELECT \* FROM trash\s+ORDER BY trashed_at DESC/i.test(sql)) {
              return { results: [...trashRows].sort((a, b) => b.trashed_at - a.trashed_at) };
            }
            if (/SELECT \* FROM logs/i.test(sql)) {
              const bound = statement.bound || [];
              const size = /LIMIT \? OFFSET \?/i.test(sql) ? bound[bound.length - 2] : undefined;
              const offset = /LIMIT \? OFFSET \?/i.test(sql) ? bound[bound.length - 1] : 0;
              const rows = filteredLogs(sql, /LIMIT \? OFFSET \?/i.test(sql) ? bound.slice(0, -2) : bound);
              return { results: size == null ? rows : rows.slice(offset, offset + size) };
            }
            return { results: [] };
          },
        };
        return statement;
      },
    },
  };
}
