function syncInputValue(fromNode, toNode) {
  if (fromNode.nodeName !== 'INPUT' && fromNode.nodeName !== 'TEXTAREA' && fromNode.nodeName !== 'SELECT') return;
  if (document.activeElement === fromNode) return;
  if ('value' in fromNode && toNode.value !== fromNode.value) {
    fromNode.value = toNode.value;
  }
  if (fromNode.nodeName === 'INPUT') {
    if (toNode.checked !== undefined) fromNode.checked = toNode.checked;
    if (toNode.disabled !== undefined) fromNode.disabled = toNode.disabled;
  }
}

function syncAttributes(fromNode, toNode) {
  const fromAttrs = fromNode.getAttributeNames();
  const toAttrs = new Set(toNode.getAttributeNames());

  for (const name of fromAttrs) {
    if (!toAttrs.has(name)) fromNode.removeAttribute(name);
  }

  for (const name of toAttrs) {
    const value = toNode.getAttribute(name);
    if (fromNode.getAttribute(name) !== value) {
      fromNode.setAttribute(name, value);
    }
  }

  syncInputValue(fromNode, toNode);
}

function sameNodeType(a, b) {
  return a.nodeType === b.nodeType && a.nodeName === b.nodeName;
}

function morphChildren(fromEl, toEl) {
  const fromChildren = Array.from(fromEl.childNodes);
  const toChildren = Array.from(toEl.childNodes);
  const max = Math.max(fromChildren.length, toChildren.length);

  for (let i = 0; i < max; i += 1) {
    const fromNode = fromChildren[i];
    const toNode = toChildren[i];

    if (!toNode) {
      if (fromNode) fromNode.remove();
      continue;
    }

    if (!fromNode) {
      fromEl.appendChild(toNode.cloneNode(true));
      continue;
    }

    morphNode(fromNode, toNode);
  }
}

function morphNode(fromNode, toNode) {
  if (!sameNodeType(fromNode, toNode)) {
    fromNode.replaceWith(toNode.cloneNode(true));
    return;
  }

  if (fromNode.nodeType === Node.TEXT_NODE) {
    if (fromNode.textContent !== toNode.textContent) {
      fromNode.textContent = toNode.textContent;
    }
    return;
  }

  syncAttributes(fromNode, toNode);
  morphChildren(fromNode, toNode);
}

export default function morphdom(fromNode, toNode, options = {}) {
  if (!fromNode || !toNode) return fromNode;

  if (!options.childrenOnly) {
    morphNode(fromNode, toNode);
    return fromNode;
  }

  morphChildren(fromNode, toNode);
  return fromNode;
}
