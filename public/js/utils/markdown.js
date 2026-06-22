import { escapeHtml } from './text.js';

function renderInline(text) {
  let out = text;
  const codeSpans = [];
  out = out.replace(/`([^`]+)`/g, (_, code) => {
    codeSpans.push(code);
    return `\x00CODE${codeSpans.length - 1}\x00`;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, label, url) => {
    const safe = /^(https?:\/\/|\/|#|mailto:)/i.test(url) || (/^[\w./?=&%-]+$/.test(url) && !/^javascript:/i.test(url));
    if (!safe) return whole;
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });
  out = out.replace(/\x00CODE(\d+)\x00/g, (_, i) => `<code>${codeSpans[Number(i)]}</code>`);
  return out;
}

export function renderMarkdown(source) {
  const escaped = escapeHtml(String(source || ''));
  const lines = escaped.split('\n');
  const html = [];

  let inCode = false;
  let codeBuffer = [];
  let listType = '';
  let listItems = [];
  let paragraph = [];
  let inTable = false;
  let tableHeader = [];
  let tableRows = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      html.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (listItems.length) {
      const tag = listType === 'ol' ? 'ol' : 'ul';
      const isTask = listItems.some(i => /^(<input type="checkbox"|\[ ?[x ]?\] )/.test(i));
      const items = listItems.map(item => {
        const taskMatch = item.match(/^(<input type="checkbox" disabled(?: checked)?>)\s*(.*)$/);
        if (taskMatch) return `<li style="list-style:none">${taskMatch[1]} ${taskMatch[2]}</li>`;
        return `<li>${item}</li>`;
      });
      const listClass = isTask ? ' class="task-list"' : '';
      html.push(`<${tag}${listClass}>${items.join('')}</${tag}>`);
      listItems = [];
      listType = '';
    }
  };
  const flushTable = () => {
    if (inTable) {
      const head = tableHeader.length ? `<thead><tr>${tableHeader.map(c => `<th>${renderInline(c)}</th>`).join('')}</tr></thead>` : '';
      const body = tableRows.length ? `<tbody>${tableRows.map(row => `<tr>${row.map(c => `<td>${renderInline(c)}</td>`).join('')}</tr>`).join('')}</tbody>` : '';
      html.push(`<table>${head}${body}</table>`);
      tableHeader = [];
      tableRows = [];
      inTable = false;
    }
  };

  for (const raw of lines) {
    const line = raw;

    if (/^```/.test(line.trim())) {
      if (inCode) {
        html.push(`<pre><code>${codeBuffer.join('\n')}</code></pre>`);
        codeBuffer = [];
        inCode = false;
      } else {
        flushParagraph();
        flushList();
        flushTable();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuffer.push(line);
      continue;
    }

    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      flushList();
      flushTable();
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      flushParagraph();
      flushList();
      flushTable();
      html.push('<hr>');
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      flushList();
      flushTable();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    if (/^&gt;\s?/.test(trimmed)) {
      flushParagraph();
      flushList();
      flushTable();
      html.push(`<blockquote>${renderInline(trimmed.replace(/^&gt;\s?/, ''))}</blockquote>`);
      continue;
    }

    if (/^\|/.test(trimmed) && /\|$/.test(trimmed)) {
      flushParagraph();
      flushList();
      const cells = trimmed.split('|').filter((_, i, a) => i > 0 && i < a.length - 1).map(c => c.trim());
      if (/^[-:\s]+\|[-:\s]+/.test(trimmed) && /^[-:\s]+$/.test(cells.join(''))) {
        continue;
      }
      if (!inTable) {
        inTable = true;
        tableHeader = cells;
      } else {
        tableRows.push(cells);
      }
      continue;
    }

    const ol = trimmed.match(/^\d+\.\s+(.*)$/);
    if (ol) {
      flushParagraph();
      flushTable();
      if (listType && listType !== 'ol') flushList();
      listType = 'ol';
      listItems.push(ol[1]);
      continue;
    }

    const ul = trimmed.match(/^[-*+]\s+(.*)$/);
    if (ul) {
      flushParagraph();
      flushTable();
      if (listType && listType !== 'ul') flushList();
      listType = 'ul';
      const content = ul[1];
      const task = content.match(/^\[( |x|X)?\]\s+(.*)$/);
      if (task) {
        const checked = task[1] && task[1] !== ' ' ? ' checked' : '';
        listItems.push(`<input type="checkbox" disabled${checked}> ${task[2]}`);
      } else {
        listItems.push(content);
      }
      continue;
    }

    flushList();
    flushTable();
    paragraph.push(trimmed);
  }

  if (inCode) html.push(`<pre><code>${codeBuffer.join('\n')}</code></pre>`);
  flushParagraph();
  flushList();
  flushTable();

  return html.join('\n');
}

export function isMarkdownName(name = '') {
  return /\.(md|markdown)$/i.test(name);
}
