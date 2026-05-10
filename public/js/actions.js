async openPreview(path, name, protectedItem = false) {
    if (Array.isArray(path)) {
        [path, name, protectedItem = false] = path;
    } else if (path && typeof path === 'object') {
        protectedItem = Boolean(path.protected ?? protectedItem);
        name = path.name || path.fullName || name;
        path = path.path || path.fullKey || path.key || '';
    }

    if (!name && typeof path === 'string') {
        name = path.split('/').pop() || '';
    }
    if (!path || !name) {
        Message.error('无法预览');
        return;
    }

    // 如果文件受保护且非管理员，要求输入密码
    if (protectedItem && state.userRole !== 'admin') {
        return this.handlePasswordRequired({ path }, () => this.openPreview(path, name, false));
    }

    state.currentPreviewPath = path;
    state.currentPreviewText = '';
    state.isEditing = false;

    const content = document.getElementById('previewContent');
    const title = document.getElementById('previewTitle');
    const editBtn = document.getElementById('editBtn');
    const saveBtn = document.getElementById('saveBtn');

    // 防御性处理：确保元素存在
    if (!content || !title || !editBtn || !saveBtn) {
        console.error('预览模态框 DOM 元素缺失');
        return;
    }

    // 先隐藏编辑和保存按钮，默认不可见
    editBtn.classList.add('hidden');
    saveBtn.classList.add('hidden');

    content.className = 'flex-1 overflow-hidden bg-white';
    content.innerHTML = '<div class="p-12 text-slate-400 text-center">正在加载预览...</div>';
    title.textContent = '加载中...';
    UI.showModal('previewModal');

    try {
        const ext = name.split('.').pop().toLowerCase();
        const url = api.previewUrl(path);

        if (['jpg','jpeg','png','gif','webp'].includes(ext)) {
            content.innerHTML = `<div class="preview-media-shell"><img src="${escapeHtml(url)}" class="preview-media" id="previewImg" alt=""></div>`;
            const img = document.getElementById('previewImg');
            img.ondblclick = () => {
                if (!document.fullscreenElement) img.requestFullscreen();
                else document.exitFullscreen();
            };
        } else if (['mp4','webm'].includes(ext)) {
            content.innerHTML = `<div class="preview-media-shell"><video src="${escapeHtml(url)}" class="preview-media" controls autoplay playsinline></video></div>`;
        } else if (['mp3','wav','ogg','flac'].includes(ext)) {
            content.innerHTML = `<div class="preview-audio-shell"><audio src="${escapeHtml(url)}" controls autoplay class="w-full max-w-xl"></audio></div>`;
        } else if (ext === 'pdf') {
            content.innerHTML = `<iframe src="${escapeHtml(url)}" class="preview-frame" title="${escapeHtml(name)}"></iframe>`;
        } else if (['txt','md','json','js','css','html','xml','csv','log','yml','yaml'].includes(ext)) {
            const res = await api.preview(path);
            if (res.status === 403) {
                const data = await res.json().catch(() => null);
                if (data?.code === 'password_required') return this.handlePasswordRequired(data, () => this.openPreview(path, name, false));
            }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const text = await res.text();
            state.currentPreviewText = text;

            // 仅管理员显示编辑按钮
            if (state.userRole === 'admin') editBtn.classList.remove('hidden');

            if (ext === 'md') content.innerHTML = `<div class="preview-text-shell markdown-body">${sanitizeHtml(marked.parse(text))}</div>`;
            else {
                content.innerHTML = '';
                content.appendChild(buildTextPreviewShell(text));
            }
        } else {
            content.innerHTML = '<div class="p-12 text-slate-400 text-center">该文件类型暂不支持在线预览</div>';
        }

        title.textContent = name;

    } catch (e) {
        content.innerHTML = `<div class="p-12 text-red-400 text-center">无法预览内容${e?.message ? `：${escapeHtml(e.message)}` : ''}</div>`;
        title.textContent = name;
    }
}
