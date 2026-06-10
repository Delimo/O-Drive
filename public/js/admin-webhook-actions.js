import { adminState } from './admin-state.js';
import { api } from './api.js';
import {
  buttonByAction,
  renderAdminEmptyState,
  renderAdminLoadingState,
  setAdminButtonBusy,
  setAdminStatusMessage,
} from './admin-ui-utils.js';
import { escapeHtml } from './utils.js';
import { adminTime } from './admin-format-utils.js';
import {
  WEBHOOK_EVENT_KEYS,
  headersToText,
  normalizeWebhookItems,
  parseHeadersText,
  selectedWebhookEvents,
  setWebhookEvents,
  webhookEventsLabel,
} from './admin-webhook-utils.js';

function setWebhookForm(item = {}) {
  const values = {
    webhookUrlInput: item.url || '',
    webhookMethodInput: item.method || 'POST',
    webhookContentTypeInput: item.contentType || 'application/json',
    webhookHeadersInput: headersToText(item.headers),
    webhookBodyInput: item.body || '',
    webhookMsgTypeInput: item.msgtype || 'json',
    webhookNameInput: item.name || '',
  };
  Object.entries(values).forEach(([id, value]) => {
    const input = document.getElementById(id);
    if (input) input.value = value;
  });
  setWebhookEvents(item.events);
}

function setWebhookResult(text = '', tone = 'muted') {
  setAdminStatusMessage('webhookResult', text, tone);
}

function setWebhookListCount(count = 0) {
  const label = document.getElementById('webhookListCount');
  if (label) label.textContent = `${count} 个`;
}

function setWebhookFormMode(item = null) {
  const editing = adminState.webhookEditingIndex >= 0;
  const hint = document.getElementById('webhookFormHint');
  const button = document.getElementById('webhookSaveButton');
  if (button) {
    button.textContent = editing ? '更新规则' : '保存规则';
    button.dataset.idleLabel = editing ? '更新规则' : '保存规则';
  }
  if (hint) {
    const label = item?.name || item?.url || (editing ? `Webhook #${adminState.webhookEditingIndex + 1}` : '');
    hint.textContent = editing ? `正在编辑：${label}` : '';
    hint.classList.toggle('hidden', !editing);
  }
  document.querySelectorAll('.webhook-row').forEach((row, index) => {
    row.classList.toggle('is-editing', editing && index === adminState.webhookEditingIndex);
  });
}

function setWebhookRowStatus(index, text = '', tone = 'muted') {
  const status = document.querySelector(`[data-webhook-status="${index}"]`);
  if (!status) {
    setWebhookResult(text, tone);
    return;
  }
  document.querySelectorAll('.webhook-row-status').forEach(item => {
    if (item === status) return;
    item.textContent = '';
    item.classList.remove('is-visible', 'is-error', 'is-muted', 'is-success', 'is-loading');
  });
  status.textContent = text;
  status.classList.toggle('is-visible', Boolean(text));
  status.classList.toggle('is-error', tone === 'error');
  status.classList.toggle('is-muted', tone === 'muted');
  status.classList.toggle('is-success', tone === 'success');
  status.classList.toggle('is-loading', tone === 'loading');
}

function readWebhookForm() {
  const events = selectedWebhookEvents();
  return {
    id: `${Date.now()}`,
    name: (document.getElementById('webhookNameInput')?.value || '').trim(),
    msgtype: document.getElementById('webhookMsgTypeInput')?.value || 'json',
    url: (document.getElementById('webhookUrlInput')?.value || '').trim(),
    method: (document.getElementById('webhookMethodInput')?.value || 'POST').toUpperCase(),
    contentType: (document.getElementById('webhookContentTypeInput')?.value || 'application/json').trim(),
    headers: parseHeadersText(document.getElementById('webhookHeadersInput')?.value || ''),
    body: document.getElementById('webhookBodyInput')?.value || '',
    events: events.length === WEBHOOK_EVENT_KEYS.length ? [] : events,
    enabled: true,
  };
}

export function createAdminWebhookActions({ adminConfirm }) {
  return {
    focusWebhookEditor() {
      document.getElementById('webhookUrlInput')?.focus();
    },

    async loadWebhooks() {
      const list = document.getElementById('webhookList');
      setWebhookResult();
      setWebhookListCount(0);
      if (!list) return;
      list.innerHTML = renderAdminLoadingState('正在加载 Webhook...', '正在读取通知目标和事件订阅配置');
      const { res, data } = await api.adminWebhooks();
      if (!res.ok) {
        list.innerHTML = renderAdminEmptyState({
          title: 'Webhook 加载失败',
          description: '请稍后刷新，或检查通知配置服务是否可用。',
          primaryAction: 'refresh-webhooks',
          primaryLabel: '重新加载',
          compact: true,
        });
        return;
      }
      const items = normalizeWebhookItems(data);
      if (adminState.webhookEditingIndex >= items.length) adminState.webhookEditingIndex = -1;
      setWebhookListCount(items.length);
      if (items.length === 0) {
        adminState.webhookEditingIndex = -1;
        setWebhookFormMode();
        list.innerHTML = renderAdminEmptyState({
          title: '暂未配置 Webhook',
          description: '创建一个通知目标后，就可以订阅上传、删除、异常提醒等事件。',
          primaryAction: 'focus-webhook-editor',
          primaryLabel: '开始配置',
        });
        return;
      }
      list.innerHTML = items.map((item, i) => `
        <div class="webhook-row ${i === adminState.webhookEditingIndex ? 'is-editing' : ''}">
          <div class="webhook-row-main">
            <div class="webhook-row-head">
              <span class="webhook-type-badge">${escapeHtml(item.method || 'POST')}</span>
              <span class="webhook-type-badge">格式 ${escapeHtml(item.msgtype || 'json')}</span>
              <strong class="webhook-row-title">${escapeHtml(item.name || `Webhook #${i + 1}`)}</strong>
            </div>
            <div class="webhook-url">${escapeHtml(item.url)}</div>
            <div class="webhook-meta">
              <span>${escapeHtml(item.contentType || 'application/json')}</span>
              <span>${escapeHtml(webhookEventsLabel(item.events))}</span>
              ${Object.keys(item.headers || {}).length ? '<span>headers</span>' : ''}
              ${item.body ? '<span>body</span>' : ''}
            </div>
          </div>
          <div class="webhook-row-actions">
            <div class="webhook-row-buttons">
              <button class="btn h-8 px-3" data-admin-action="edit-webhook" data-args='${escapeHtml(JSON.stringify([i]))}'>编辑</button>
              <button class="btn h-8 px-3" data-admin-action="test-webhook" data-args='${escapeHtml(JSON.stringify([i]))}'>测试发送</button>
              <button class="admin-danger-btn" data-admin-action="remove-webhook" data-args='${escapeHtml(JSON.stringify([i]))}'>删除</button>
            </div>
            <p class="webhook-row-status" data-webhook-status="${i}" role="status" aria-live="polite"></p>
          </div>
        </div>
      `).join('');
      setWebhookFormMode(items[adminState.webhookEditingIndex]);
    },

    async loadWebhookDeliveries() {
      const list = document.getElementById('webhookDeliveriesList');
      if (!list) return;
      list.innerHTML = renderAdminLoadingState('正在加载投递记录...', '正在整理最近 20 条通知结果');
      const { res, data } = await api.adminWebhookDeliveries();
      if (!res.ok) {
        list.innerHTML = renderAdminEmptyState({
          title: '投递记录加载失败',
          description: '暂时无法读取通知历史，请稍后刷新。',
          primaryAction: 'refresh-webhook-deliveries',
          primaryLabel: '重新加载',
          compact: true,
        });
        return;
      }
      const items = Array.isArray(data?.items) ? data.items : [];
      if (!items.length) {
        list.innerHTML = renderAdminEmptyState({
          title: '暂无投递记录',
          description: '保存并触发一次 Webhook 后，这里会显示最近的投递结果。',
          compact: true,
        });
        return;
      }
      list.innerHTML = items.map(item => {
        const status = Number(item.status || item.status_code || 0);
        const ok = status >= 200 && status < 300;
        const event = item.event || item.event_type || 'webhook';
        const target = item.url || item.endpoint || item.name || 'Webhook';
        const error = item.error || item.error_message || '';
        return `
          <div class="webhook-delivery-row">
            <div class="webhook-delivery-head">
              <strong>${escapeHtml(event)}</strong>
              <span class="status-pill ${ok ? 'is-ok' : 'is-bad'}">${status || (ok ? 'OK' : '失败')}</span>
            </div>
            <div class="webhook-delivery-meta">
              <span>${escapeHtml(target)}</span>
              <span>${escapeHtml(adminTime(item.created_at || item.createdAt))}</span>
              ${item.duration_ms || item.durationMs ? `<span>${escapeHtml(String(item.duration_ms || item.durationMs))}ms</span>` : ''}
            </div>
            ${error ? `<div class="webhook-delivery-meta"><span>${escapeHtml(error)}</span></div>` : ''}
          </div>
        `;
      }).join('');
    },

    async addWebhook() {
      const saveButton = buttonByAction('add-webhook');
      let next;
      try {
        next = readWebhookForm();
      } catch (err) {
        setWebhookResult(err.message || 'Headers 不是有效 JSON。', 'error');
        return;
      }
      if (!next.url || !next.url.startsWith('http')) {
        setWebhookResult('请输入有效的 http(s) URL。', 'error');
        return;
      }
      const { data } = await api.adminWebhooks();
      const current = normalizeWebhookItems(data);
      const editingIndex = adminState.webhookEditingIndex;
      const editingItem = editingIndex >= 0 ? current[editingIndex] : null;
      let updated = Boolean(editingItem);
      if (editingItem) {
        current[editingIndex] = { ...editingItem, ...next, id: editingItem.id };
      } else {
        const existingIndex = current.findIndex(item => item.url === next.url);
        if (existingIndex >= 0) {
          current[existingIndex] = { ...current[existingIndex], ...next, id: current[existingIndex].id };
          updated = true;
        } else {
          current.push(next);
        }
      }
      setAdminButtonBusy(saveButton, true, editingItem ? '更新中...' : '保存中...');
      setWebhookResult('正在保存...', 'loading');
      try {
        const { res, data: saveData } = await api.setAdminWebhooks(current);
        if (!res.ok || saveData?.success === false) {
          setWebhookResult(saveData?.message || '保存失败', 'error');
          return;
        }
        adminState.webhookEditingIndex = -1;
        setWebhookForm();
        await this.loadWebhooks();
        setWebhookResult(updated ? 'Webhook 已更新。' : `已添加，共 ${current.length} 个 Webhook。`, 'success');
      } finally {
        setAdminButtonBusy(saveButton, false);
      }
    },

    async editWebhook(index) {
      const { data } = await api.adminWebhooks();
      const current = normalizeWebhookItems(data);
      const item = current[index];
      if (!item) return;
      adminState.webhookEditingIndex = index;
      setWebhookForm(item);
      setWebhookFormMode(item);
      document.getElementById('webhookSettingsBody')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    async removeWebhook(index) {
      const { data } = await api.adminWebhooks();
      const current = normalizeWebhookItems(data);
      if (index < 0 || index >= current.length) return;
      if (!(await adminConfirm('删除 Webhook？', current[index].name || current[index].url))) return;
      const removed = current.splice(index, 1);
      setWebhookResult('正在保存...', 'loading');
      const { res } = await api.setAdminWebhooks(current);
      if (!res.ok) {
        setWebhookResult('删除失败', 'error');
        return;
      }
      if (adminState.webhookEditingIndex === index) {
        adminState.webhookEditingIndex = -1;
        setWebhookForm();
      } else if (adminState.webhookEditingIndex > index) {
        adminState.webhookEditingIndex -= 1;
      }
      await this.loadWebhooks();
      setWebhookResult(`已删除 ${removed[0].name || removed[0].url}。`, 'success');
    },

    async testWebhook(index) {
      setWebhookResult();
      const { data } = await api.adminWebhooks();
      const current = normalizeWebhookItems(data);
      const endpoint = current[index];
      if (!endpoint) return;
      const testButton = buttonByAction('test-webhook');
      setAdminButtonBusy(testButton, true, '测试中...');
      setWebhookRowStatus(index, '正在发送测试通知...', 'loading');
      try {
        const { res, data: testData } = await api.testAdminWebhook(endpoint);
        if (!res.ok || testData?.success === false) {
          setWebhookRowStatus(index, testData?.message || '测试发送失败，请检查 URL、平台类型或签名配置。', 'error');
          return;
        }
        const durationLabel = testData?.durationMs ? `，耗时 ${testData.durationMs}ms` : '';
        setWebhookRowStatus(index, `测试发送成功${durationLabel}`, 'success');
      } finally {
        setAdminButtonBusy(testButton, false);
      }
    },
  };
}
