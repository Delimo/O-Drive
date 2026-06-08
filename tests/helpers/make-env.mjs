export function makeEnv({ objects = [], prefixes = [], listPageSize = Infinity } = {}) {
  const byKey = new Map(objects.map(o => [o.key, { ...o }]));
  const trashRows = [];
  const protectedRows = [];
  const pathAttemptRows = [];
  const loginAttemptRows = [];
  const loginAlertRows = [];
  const downloadBurstRows = [];
  const webhookDeliveryRows = [];
  const systemWarningRows = [];
  const taskRows = [];
  const settingsRows = new Map();
  const kvRows = new Map();
  const fileIndexRows = [];
  const shareRows = [];
  const logs = [];
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
  const materializedLogs = () => logs.map((log, i) => ({
    ...log,
    timestamp: new Date(Date.now() - i * 1000).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ''),
  }));
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
      const from = String(bound[idx++] || '');
      rows = rows.filter(row => String(row.timestamp || '') >= from);
    }
    if (/timestamp <= \?/i.test(sql)) {
      const to = String(bound[idx++] || '');
      rows = rows.filter(row => String(row.timestamp || '') <= to);
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
            if (/INSERT INTO logs/i.test(sql)) {
              logs.push({ action: statement.bound?.[0], details: statement.bound?.[1], ip: statement.bound?.[2] });
            }
            if (/INSERT INTO trash/i.test(sql)) {
              trashRows.push({
                id: statement.bound?.[0],
                original_key: statement.bound?.[1],
                trash_key: statement.bound?.[2],
                name: statement.bound?.[3],
                kind: statement.bound?.[4],
                size: statement.bound?.[5],
                trashed_at: statement.bound?.[6],
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
              const row = {
                path: statement.bound?.[0],
                name: statement.bound?.[1],
                parent: statement.bound?.[2],
                kind: statement.bound?.[3],
                size: statement.bound?.[4],
                content_type: statement.bound?.[5],
                uploaded_at: statement.bound?.[6],
                updated_at: statement.bound?.[7],
              };
              const idx = fileIndexRows.findIndex(item => item.path === row.path);
              if (idx >= 0) fileIndexRows[idx] = row;
              else fileIndexRows.push(row);
            }
            if (/INSERT INTO share_links/i.test(sql)) {
              const row = {
                token: statement.bound?.[0],
                path: statement.bound?.[1],
                name: statement.bound?.[2],
                size: statement.bound?.[3],
                content_type: statement.bound?.[4],
                allow_preview: statement.bound?.[5],
                allow_download: statement.bound?.[6],
                expires_at: statement.bound?.[7],
                max_downloads: statement.bound?.[8],
                download_count: 0,
                password_salt: statement.bound?.[9] || '',
                password_hash: statement.bound?.[10] || '',
                expired_notified_at: 0,
                created_at: statement.bound?.[12] ?? statement.bound?.[11] ?? statement.bound?.[9],
                last_accessed_at: 0,
              };
              const idx = shareRows.findIndex(item => item.token === row.token);
              if (idx >= 0) shareRows[idx] = row;
              else shareRows.push(row);
            }
            if (/INSERT INTO webhook_deliveries/i.test(sql)) {
              webhookDeliveryRows.push({
                id: webhookDeliveryRows.length + 1,
                event: statement.bound?.[0],
                endpoint: statement.bound?.[1],
                url: statement.bound?.[2],
                ok: statement.bound?.[3],
                status: statement.bound?.[4],
                error: statement.bound?.[5],
                duration_ms: statement.bound?.[6],
                created_at: statement.bound?.[7],
              });
            }
            if (/INSERT INTO system_warnings/i.test(sql)) {
              systemWarningRows.push({
                id: systemWarningRows.length + 1,
                source: statement.bound?.[0],
                message: statement.bound?.[1],
                created_at: statement.bound?.[2],
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
                result: '{}',
                error: '',
                created_at: statement.bound?.[5],
                updated_at: statement.bound?.[6],
                finished_at: 0,
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
            if (/INSERT OR REPLACE INTO settings/i.test(sql)) {
              settingsRows.set('trash_retention_days', statement.bound?.[0]);
            }
            if (/INSERT OR REPLACE INTO kv_config/i.test(sql)) {
              kvRows.set(statement.bound?.[0], statement.bound?.[1]);
            }
            if (/INSERT OR IGNORE INTO settings/i.test(sql)) {
              settingsRows.set(statement.bound?.[0], 'hidden');
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
            if (/DELETE FROM share_links WHERE token = \?/i.test(sql)) {
              const token = statement.bound?.[0];
              const idx = shareRows.findIndex(row => row.token === token);
              if (idx >= 0) shareRows.splice(idx, 1);
            }
            if (/UPDATE share_links SET last_accessed_at = \? WHERE token = \?/i.test(sql)) {
              const row = shareRows.find(item => item.token === statement.bound?.[1]);
              if (row) row.last_accessed_at = statement.bound?.[0];
            }
            if (/UPDATE share_links SET expired_notified_at = \? WHERE token = \?/i.test(sql)) {
              const row = shareRows.find(item => item.token === statement.bound?.[1]);
              if (row) row.expired_notified_at = statement.bound?.[0];
            }
            if (/UPDATE file_tasks SET status = \?/i.test(sql)) {
              const id = statement.bound?.[8];
              const row = taskRows.find(item => item.id === id);
              if (row) {
                row.status = statement.bound?.[0];
                row.total = statement.bound?.[1];
                row.completed = statement.bound?.[2];
                row.failed = statement.bound?.[3];
                row.result = statement.bound?.[4];
                row.error = statement.bound?.[5];
                row.updated_at = statement.bound?.[6];
                row.finished_at = statement.bound?.[7];
              }
            }
            if (/UPDATE share_links SET download_count = download_count \+ 1/i.test(sql)) {
              const row = shareRows.find(item => item.token === statement.bound?.[1]);
              if (row) {
                row.download_count = Number(row.download_count || 0) + 1;
                row.last_accessed_at = statement.bound?.[0];
              }
            }
            if (/DELETE FROM file_index WHERE path = \? OR path LIKE \?/i.test(sql)) {
              const path = statement.bound?.[0];
              const prefix = String(statement.bound?.[1] || '').replace(/%$/, '');
              for (let i = fileIndexRows.length - 1; i >= 0; i--) {
                if (fileIndexRows[i].path === path || fileIndexRows[i].path.startsWith(prefix)) fileIndexRows.splice(i, 1);
              }
            }
            if (/DELETE FROM file_index$/i.test(sql.trim())) {
              fileIndexRows.length = 0;
            }
            if (/DELETE FROM path_access_attempts$/i.test(sql.trim())) {
              pathAttemptRows.length = 0;
            }
            if (/DELETE FROM download_bursts WHERE window_start < \? AND last_alert < \?/i.test(sql)) {
              const [windowCutoff, alertCutoff] = statement.bound || [];
              for (let i = downloadBurstRows.length - 1; i >= 0; i--) {
                const row = downloadBurstRows[i];
                if (Number(row.window_start || 0) < windowCutoff && Number(row.last_alert || 0) < alertCutoff) downloadBurstRows.splice(i, 1);
              }
            }
            return {};
          },
          async first() {
            if (/SELECT COUNT\(\*\) as count FROM file_index/i.test(sql)) return { count: fileIndexRows.length };
            if (/SELECT COUNT\(\*\) as count FROM path_access_attempts/i.test(sql)) return { count: pathAttemptRows.length };
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
            if (/SELECT COUNT\(\*\) as count FROM logs/i.test(sql)) return { count: filteredLogs(sql, statement.bound || []).length };
            if (/SELECT value FROM settings WHERE key = 'trash_retention_days'/i.test(sql)) {
              const value = settingsRows.get('trash_retention_days');
              return value == null ? null : { value };
            }
            if (/SELECT value FROM kv_config WHERE key = \?/i.test(sql)) {
              const value = kvRows.get(statement.bound?.[0]);
              return value == null ? null : { value };
            }
            if (/SELECT COALESCE\(SUM\(size\), 0\) AS total FROM file_index/i.test(sql)) {
              return { total: fileIndexRows.reduce((sum, row) => sum + Number(row.size || 0), 0) };
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
            return null;
          },
          async all() {
            if (/SELECT \* FROM file_index WHERE lower\(name\) LIKE \?/i.test(sql)) {
              const like = String(statement.bound?.[0] || '').replace(/%/g, '');
              let rows = fileIndexRows.filter(row => row.name.toLowerCase().includes(like));
              if (/path = \? OR path LIKE \?/i.test(sql)) {
                const scope = statement.bound?.[1];
                const prefix = String(statement.bound?.[2] || '').replace(/%$/, '');
                rows = rows.filter(row => row.path === scope || row.path.startsWith(prefix));
              }
              const limit = statement.bound?.[statement.bound.length - 2] ?? rows.length;
              const offset = statement.bound?.[statement.bound.length - 1] ?? 0;
              return { results: rows.sort((a, b) => a.path.localeCompare(b.path)).slice(offset, offset + limit) };
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
            if (/SELECT \* FROM webhook_deliveries ORDER BY created_at DESC LIMIT 20/i.test(sql)) {
              return { results: [...webhookDeliveryRows].sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0)).slice(0, 20) };
            }
            if (/SELECT \* FROM system_warnings ORDER BY created_at DESC LIMIT 10/i.test(sql)) {
              return { results: [...systemWarningRows].sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0)).slice(0, 10) };
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
