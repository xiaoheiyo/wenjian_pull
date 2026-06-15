const path = require('path');
const fs = require('fs');
const { escapeHtml, formatFileSize, formatTime } = require('./utils');
const { substituteDate } = require('./sync');

function encodePath(relPath) {
    return relPath.split('/').map(s => encodeURIComponent(s)).join('/');
}

function generateDirectoryListing(currentDir, entries, baseDir, syncBindings) {
    let relCurrent = path.relative(baseDir, currentDir);
    if (relCurrent === '') relCurrent = '';
    else relCurrent = relCurrent.replace(/\\/g, '/');
    let displayPath = '/' + (relCurrent === '' ? '' : relCurrent + '/');

    let rows = '';
    for (const entry of entries) {
        const entryName = entry.name;
        let isDirectory = false;
        if (typeof entry.isDirectory === 'function') isDirectory = entry.isDirectory();
        else if (entry.isDirectory !== undefined) isDirectory = entry.isDirectory;
        else if (entry.type) isDirectory = entry.type === 'directory';

        let entryRelPath = relCurrent === '' ? entryName : relCurrent + '/' + entryName;
        entryRelPath = entryRelPath.replace(/\\/g, '/');
        const encodedPath = encodePath(entryRelPath);
        const hrefForLink = '/' + encodedPath + (isDirectory ? '/' : '');

        let fileSizeStr = '', mtimeStr = '—';
        const fullEntryPath = path.join(currentDir, entryName);
        try {
            const stats = fs.statSync(fullEntryPath);
            fileSizeStr = isDirectory ? '—' : formatFileSize(stats.size);
            mtimeStr = formatTime(stats.mtime);
        } catch (e) { fileSizeStr = '?'; }

        const icon = isDirectory ? '📁' : '📄';

        let actionButtons = '';
        if (!isDirectory) {
            const downloadHref = hrefForLink + '?download=1';
            actionButtons = `
                    <button class="btn-delete" data-path="${hrefForLink}">🗑️</button>
                    <button class="btn-copy" data-path="${hrefForLink}">📋 复制链接</button>
                    <a href="${downloadHref}" class="btn-download" download>⬇️ 下载</a>
                `;
        } else {
            actionButtons = `
                    <button class="btn-delete" data-path="${hrefForLink}">🗑️</button>
                    <span class="no-download">📁 文件夹</span>
                `;
        }

        rows += `
                <tr>
                    <td class="icon-cell">${icon}</td>
                    <td class="name-cell">
                        <a href="${hrefForLink}" class="file-link">${escapeHtml(entryName)}</a>
                    </td>
                    <td class="size-cell">${fileSizeStr}</td>
                    <td class="time-cell">${mtimeStr}</td>
                    <td class="action-cell">${actionButtons}</td>
                </tr>
            `;
    }

    let parentLink = '';
    if (relCurrent !== '') {
        const parentRel = path.dirname(relCurrent);
        const parentPathForLink = (parentRel === '.' ? '' : parentRel.replace(/\\/g, '/'));
        const parentEncoded = parentPathForLink === '' ? '' : encodePath(parentPathForLink);
        const parentHref = '/' + (parentEncoded === '' ? '' : parentEncoded + '/');
        parentLink = `<div class="parent-dir"><a href="${parentHref}">⬆️ 返回上级目录</a></div>`;
    } else {
        parentLink = `<div class="parent-dir disabled"><span>🏠 当前在根目录</span></div>`;
    }

    let syncSection = '';
    if (syncBindings && syncBindings.length > 0) {
        let items = '';
        for (let si = 0; si < syncBindings.length; si++) {
            const b = syncBindings[si];
            const displayUrl = substituteDate(b.url);
            let modeBadge = '';
            if (b.syncMode === 'interval') {
                var ival = b.intervalValue || b.intervalMinutes || 1;
                var iunitMap = { minutes:'分', hours:'时', days:'天', weeks:'周', months:'月' };
                modeBadge = '<span class="sync-badge" style="background:#6366f1">每' + ival + (iunitMap[b.intervalUnit] || '分') + '</span>';
            }
            else if (b.syncMode === 'scheduled') modeBadge = '<span class="sync-badge" style="background:#6366f1">' + (b.scheduledTime || '08:00') + '</span>';
            if (b.isRegex) {
                const displayPath = substituteDate(b.localPath);
                items += '<div class="sync-item sync-regex"><span class="sync-badge" style="background:#f59e0b">🔀 正则</span>' + modeBadge + '<span class="sync-url" title="' + escapeHtml(b.url) + '">' + escapeHtml(displayUrl) + '</span> → <span class="sync-link" title="' + escapeHtml(b.localPath) + '">' + escapeHtml(displayPath) + '</span>' +
                    '<button class="sync-item-btn" data-idx="' + si + '" title="同步所有匹配文件">同步全部</button>' +
                    '<button class="sync-copy" data-url="' + escapeHtml(displayUrl) + '" title="复制源 URL">📋</button></div>';
            } else {
                const filePath = substituteDate(b.localPath).replace(/^\//, '');
                const href = '/' + encodePath(filePath);
                const exists = fs.existsSync(path.join(baseDir, filePath));
                items += '<div class="sync-item">' + modeBadge + '<span class="sync-url" title="' + escapeHtml(b.url) + '">' + escapeHtml(displayUrl) + '</span> → ' +
                    (exists ? '<a href="' + href + '" class="sync-link" title="' + escapeHtml(b.localPath) + '">' + escapeHtml(filePath) + '</a>' : '<span class="sync-missing" title="' + escapeHtml(b.localPath) + '">' + escapeHtml(filePath) + '（未同步）</span>') +
                    (!exists ? '<button class="sync-item-btn" data-idx="' + si + '">同步</button>' : '') +
                    '<button class="sync-copy-path" data-path="' + href + '" title="复制下载链接">📁</button>' +
                    '<button class="sync-copy" data-url="' + escapeHtml(displayUrl) + '" title="复制源 URL">📋</button></div>';
            }
        }
        syncSection = '<div class="sync-section">' + items + '</div>';
    }

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>文件目录 - ${escapeHtml(displayPath)}</title>
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
            background: #f5f7fb;
            margin: 0;
            padding: 20px;
            color: #1f2d3d;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 16px;
            box-shadow: 0 8px 20px rgba(0,0,0,0.05);
            overflow: hidden;
            padding: 20px 24px 32px;
        }
        h1 {
            font-size: 1.8rem;
            margin-top: 0;
            margin-bottom: 0.25rem;
            font-weight: 600;
            color: #0a2b4e;
            border-left: 5px solid #3b82f6;
            padding-left: 18px;
        }
        .sub {
            color: #4b5563;
            margin-bottom: 24px;
            font-size: 0.9rem;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 12px;
            margin-top: 8px;
            padding-left: 23px;
        }
        .parent-dir {
            margin-bottom: 20px;
            padding: 8px 12px;
            background: #f1f5f9;
            border-radius: 12px;
            display: inline-block;
        }
        .parent-dir a { text-decoration: none; font-weight: 500; color: #2563eb; }
        .parent-dir a:hover { text-decoration: underline; }
        .disabled { color: #64748b; font-style: italic; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th { text-align: left; padding: 12px 8px; background: #f8fafc; font-weight: 600; border-bottom: 2px solid #e2e8f0; color: #334155; }
        td { padding: 10px 8px; border-bottom: 1px solid #eef2f6; vertical-align: middle; }
        tr:hover { background-color: #fafcff; }
        .icon-cell { width: 40px; font-size: 1.3rem; text-align: center; }
        .name-cell { word-break: break-all; }
        .file-link { text-decoration: none; color: #1e40af; font-weight: 500; }
        .file-link:hover { text-decoration: underline; color: #3b82f6; }
        .size-cell { color: #4b5563; font-size: 0.85rem; white-space: nowrap; padding-right: 20px; }
        .action-cell { text-align: right; white-space: nowrap; }
        .btn-download, .btn-copy, .btn-delete {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 40px;
            font-size: 0.8rem;
            font-weight: 500;
            text-decoration: none;
            transition: 0.2s;
            cursor: pointer;
            border: 1px solid #cbd5e1;
            margin-left: 6px;
        }
        .btn-download { background: #eef2ff; color: #2563eb; }
        .btn-download:hover { background: #3b82f6; color: white; border-color: #3b82f6; }
        .btn-copy { background: #f1f5f9; color: #334155; }
        .btn-copy:hover { background: #e2e8f0; color: #0f172a; }
        .btn-delete {
            padding: 1px 6px;
            font-size: 0.7rem;
            font-weight: 400;
            border: 1px solid transparent;
            margin-left: 2px;
            background: transparent;
            color: #94a3b8;
            opacity: 0.5;
            line-height: 1.4;
        }
        .btn-delete:hover { background: #fef2f2; color: #dc2626; border-color: #fecaca; opacity: 1; }
        .no-download { background: #e9ecef; padding: 4px 12px; border-radius: 40px; font-size: 0.8rem; color: #6c757d; }
        .sync-section { margin-bottom: 20px; padding: 12px 16px; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 12px; font-size: 0.85rem; }
        .sync-item { padding: 4px 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .sync-url { color: #2563eb; word-break: break-all; font-size: 0.8rem; max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .sync-link { color: #059669; font-weight: 500; text-decoration: none; }
        .sync-link:hover { text-decoration: underline; }
        .sync-missing { color: #94a3b8; font-style: italic; }
        .sync-copy, .sync-copy-path { background: none; border: none; cursor: pointer; font-size: 0.9rem; padding: 0 4px; opacity: 0.4; transition: 0.2s; }
        .sync-copy { margin-left: auto; }
        .sync-copy:hover, .sync-copy-path:hover { opacity: 1; }
        .sync-item-btn { background: #059669; color: white; border: none; border-radius: 6px; padding: 2px 10px; cursor: pointer; font-size: 0.8rem; margin-left: 4px; }
        .sync-item-btn:hover { background: #047857; }
        .sync-regex { background: #fef3c7; border-radius: 6px; padding: 6px 8px; }
        .sync-badge { font-size: 0.75rem; background: #f59e0b; color: white; padding: 1px 6px; border-radius: 4px; font-weight: 600; white-space: nowrap; }
        .footer-note { margin-top: 28px; font-size: 0.75rem; text-align: center; color: #6c86a3; border-top: 1px solid #e2e8f0; padding-top: 18px; }
        .btn-sync-settings { background: none; border: none; font-size: 1.2rem; cursor: pointer; margin-left: 12px; vertical-align: middle; opacity: 0.4; transition: 0.2s; }
        .btn-sync-settings:hover { opacity: 1; }
        .modal-overlay { display: none; position: fixed; inset: 0; z-index: 9999; background: rgba(0,0,0,0.35); align-items: center; justify-content: center; }
        .modal-overlay.active { display: flex; }
        .modal { background: white; border-radius: 16px; padding: 28px 32px; width: 600px; max-width: 90vw; max-height: 80vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
        .modal h2 { margin: 0 0 16px; font-size: 1.4rem; }
        .modal .form-row { display: flex; gap: 8px; margin-bottom: 12px; }
        .modal .form-row input { flex: 1; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 0.9rem; }
        .modal .form-row button { padding: 8px 16px; border: none; border-radius: 8px; cursor: pointer; font-size: 0.9rem; }
        .modal .btn-add { background: #2563eb; color: white; }
        .modal .btn-add:hover { background: #1d4ed8; }
        .modal .btn-close { background: #6b7280; color: white; }
        .modal .btn-close:hover { background: #4b5563; }
        .modal .binding-list { list-style: none; padding: 0; margin: 0 0 16px; }
        .modal .binding-list li { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 8px; background: #f9fafb; }
        .modal .binding-list li .info { flex: 1; overflow: hidden; }
        .modal .binding-list li .info .url { font-size: 0.85rem; color: #2563eb; word-break: break-all; }
        .modal .binding-list li .info .path { font-size: 0.8rem; color: #6b7280; margin-top: 2px; }
        .modal .binding-list li .btn-sync-one { background: #059669; color: white; border: none; border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 0.8rem; }
        .modal .binding-list li .btn-sync-one:hover { background: #047857; }
        .modal .binding-list li .btn-edit { background: transparent; color: #6366f1; border: none; cursor: pointer; font-size: 1rem; padding: 2px 6px; opacity: 0.5; }
        .modal .binding-list li .btn-edit:hover { opacity: 1; }
        .modal .binding-list li .btn-remove { background: transparent; color: #dc2626; border: none; cursor: pointer; font-size: 1.1rem; opacity: 0.5; }
        .modal .binding-list li .btn-remove:hover { opacity: 1; }
        .modal .btn-sync-all { background: #059669; color: white; border: none; border-radius: 8px; padding: 10px 20px; cursor: pointer; font-size: 0.95rem; width: 100%; }
        .modal .btn-sync-all:hover { background: #047857; }
        .modal .sync-result { margin-top: 12px; padding: 8px 12px; border-radius: 8px; font-size: 0.85rem; background: #f0fdf4; color: #166534; display: none; }
        .modal .sync-result.error { background: #fef2f2; color: #dc2626; }
        .test-result-item { padding: 6px 8px; border: 1px solid #e5e7eb; border-radius: 6px; margin-bottom: 4px; font-size: 0.82rem; background: #f9fafb; word-break: break-all; }
        .test-result-item .test-url { color: #2563eb; }
        .test-result-item .test-path { color: #059669; margin-top: 2px; }
        .test-empty { color: #94a3b8; text-align: center; padding: 16px; font-size: 0.85rem; }
        @media (max-width: 640px) {
            body { padding: 12px; }
            .container { padding: 16px; }
            .size-cell, .time-cell { display: none; }
            .action-cell { white-space: normal; }
            .btn-download, .btn-copy, .btn-delete { margin-top: 4px; }
        }
    </style>
    <script>
        (function() {
            function escapeHtml(str) {
                if (!str) return '';
                return str.replace(/[&<>"]/g, function(m) { return m === '&' ? '&amp;' : (m === '<' ? '&lt;' : (m === '>' ? '&gt;' : '&quot;')); });
            }

            function substituteDate(str) {
                if (!str) return str;
                var now = new Date();
                var pad = function(n) { return String(n).padStart(2, '0'); };
                var YYYY = now.getFullYear();
                var MM = pad(now.getMonth() + 1);
                var DD = pad(now.getDate());
                var HH = pad(now.getHours());
                var mm = pad(now.getMinutes());
                var ss = pad(now.getSeconds());
                return str
                    .replace(/\{YYYY\}/g, YYYY)
                    .replace(/\{MM\}/g, MM)
                    .replace(/\{DD\}/g, DD)
                    .replace(/\{HH\}/g, HH)
                    .replace(/\{mm\}/g, mm)
                    .replace(/\{ss\}/g, ss)
                    .replace(/\{date\}/g, YYYY + '-' + MM + '-' + DD)
                    .replace(/\{time\}/g, HH + ':' + mm + ':' + ss)
                    .replace(/\{datetime\}/g, YYYY + '-' + MM + '-' + DD + ' ' + HH + ':' + mm + ':' + ss);
            }

            function showToast(message) {
                const toast = document.createElement('div');
                toast.innerText = message;
                toast.style.position = 'fixed';
                toast.style.bottom = '20px';
                toast.style.left = '50%';
                toast.style.transform = 'translateX(-50%)';
                toast.style.backgroundColor = '#1f2937';
                toast.style.color = 'white';
                toast.style.padding = '8px 16px';
                toast.style.borderRadius = '40px';
                toast.style.fontSize = '14px';
                toast.style.zIndex = '9999';
                toast.style.opacity = '0.9';
                toast.style.maxWidth = '80%';
                toast.style.wordBreak = 'break-all';
                toast.style.textAlign = 'center';
                document.body.appendChild(toast);
                setTimeout(function() { toast.remove(); }, 2500);
            }

            function copyToClipboard(text) {
                if (navigator.clipboard && window.isSecureContext !== false) {
                    navigator.clipboard.writeText(text).then(function() {
                        showToast('✅ 链接已复制: ' + text);
                    }).catch(function(err) {
                        console.error(err);
                        fallbackCopy(text);
                    });
                } else {
                    fallbackCopy(text);
                }
            }

            function fallbackCopy(text) {
                var ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.top = '-9999px';
                ta.style.left = '-9999px';
                document.body.appendChild(ta);
                ta.select();
                ta.setSelectionRange(0, text.length);
                var ok = false;
                try { ok = document.execCommand('copy'); } catch(e) {}
                document.body.removeChild(ta);
                if (ok) { showToast('✅ 链接已复制: ' + text); }
                else { prompt('无法自动复制，请手动复制:', text); }
            }

            function ajax(method, url, body, cb) {
                var xhr = new XMLHttpRequest();
                xhr.open(method, url, true);
                if (body && typeof body === 'string') xhr.setRequestHeader('Content-Type', 'application/json');
                xhr.onload = function() { cb(xhr); };
                xhr.onerror = function() { showToast('❌ 请求失败'); };
                xhr.send(body || null);
            }

            function uploadFiles(files, dir) {
                var fd = new FormData();
                for (var i = 0; i < files.length; i++) fd.append('file', files[i]);
                var xhr = new XMLHttpRequest();
                xhr.open('POST', '/upload?path=' + encodeURIComponent(dir), true);
                xhr.onload = function() {
                    if (xhr.status === 200) {
                        try {
                            var resp = JSON.parse(xhr.responseText);
                            if (resp.success) {
                                showToast('✅ 上传成功: ' + resp.files.map(function(f) { return f.filename; }).join(', '));
                                setTimeout(function() { location.reload(); }, 1000);
                                return;
                            }
                        } catch(e) {}
                        showToast('❌ 上传失败');
                    } else {
                        showToast('❌ 上传失败: HTTP ' + xhr.status);
                    }
                };
                xhr.onerror = function() { showToast('❌ 上传请求失败'); };
                xhr.send(fd);
            }

            function deleteFile(filePath) {
                if (!confirm('确定要删除 ' + decodeURIComponent(filePath) + ' 吗？')) return;
                var xhr = new XMLHttpRequest();
                xhr.open('DELETE', '/delete?path=' + encodeURIComponent(filePath), true);
                xhr.onload = function() {
                    if (xhr.status === 200) { showToast('✅ 删除成功'); setTimeout(function() { location.reload(); }, 1000); }
                    else { try { var r = JSON.parse(xhr.responseText); showToast('❌ ' + (r.error || '删除失败')); } catch(e) { showToast('❌ 删除失败'); } }
                };
                xhr.onerror = function() { showToast('❌ 删除请求失败'); };
                xhr.send();
            }

            var dragCounter = 0;

            document.addEventListener('dragenter', function(e) { e.preventDefault(); dragCounter++; if (dragCounter === 1) document.getElementById('dropZone').classList.add('active'); });
            document.addEventListener('dragleave', function(e) { e.preventDefault(); dragCounter--; if (dragCounter === 0) document.getElementById('dropZone').classList.remove('active'); });
            document.addEventListener('dragover', function(e) { e.preventDefault(); });
            document.addEventListener('drop', function(e) {
                e.preventDefault();
                dragCounter = 0;
                document.getElementById('dropZone').classList.remove('active');
                var files = e.dataTransfer.files;
                if (files.length > 0) uploadFiles(files, ${JSON.stringify(relCurrent).replace(/<\//g, '<\\/')});
            });

            var editIndex = null;

            function syncModeLabel(item) {
                var mode = item.syncMode || 'manual';
                if (mode === 'interval') {
                    var val = item.intervalValue || item.intervalMinutes || 1;
                    var unitNames = { minutes: '分', hours: '时', days: '天', weeks: '周', months: '月' };
                    var u = unitNames[item.intervalUnit] || '分';
                    return '<span style="font-size:0.7rem;background:#6366f1;color:#fff;padding:1px 5px;border-radius:3px;margin-right:4px">每' + val + u + '</span>';
                }
                if (mode === 'scheduled') return '<span style="font-size:0.7rem;background:#6366f1;color:#fff;padding:1px 5px;border-radius:3px;margin-right:4px">' + (item.scheduledTime || '08:00') + '</span>';
                return '';
            }

            function loadBindings() {
                ajax('GET', '/api/sync/config', null, function(xhr) {
                    if (xhr.status === 200) {
                        try {
                            var list = JSON.parse(xhr.responseText);
                            var ul = document.getElementById('bindingList');
                            ul.innerHTML = '';
                            if (!list || list.length === 0) {
                                ul.innerHTML = '<li style="color:#94a3b8;text-align:center;justify-content:center">暂无绑定</li>';
                                return;
                            }
                            for (var i = 0; i < list.length; i++) {
                                (function(idx) {
                                    var item = list[idx];
                                    var regexTag = item.isRegex ? '<span style="font-size:0.7rem;background:#f59e0b;color:#fff;padding:1px 5px;border-radius:3px;margin-right:4px">正则</span>' : '';
                                    var smLabel = syncModeLabel(item);
                                    var displayUrl = substituteDate(item.url);
                                    var displayPath = substituteDate(item.localPath);
                                    var li = document.createElement('li');
                                    li.innerHTML = '<div class="info"><div class="url" title="' + escapeHtml(item.url) + '">' + regexTag + smLabel + escapeHtml(displayUrl) + '</div><div class="path" title="' + escapeHtml(item.localPath) + '">→ ' + escapeHtml(displayPath) + '</div></div>' +
                                        '<button class="btn-edit" id="editBtn' + idx + '">✏️</button>' +
                                        '<button class="btn-sync-one" id="syncBtn' + idx + '">同步</button>' +
                                        '<button class="btn-remove" id="rmBtn' + idx + '">✕</button>';
                                    ul.appendChild(li);
                                    document.getElementById('editBtn' + idx).onclick = function() { editBinding(idx); };
                                    document.getElementById('syncBtn' + idx).onclick = function() { syncOne(idx); };
                                    document.getElementById('rmBtn' + idx).onclick = function() { removeOne(idx); };
                                })(i);
                            }
                        } catch(e) { showToast('❌ 加载失败'); }
                    }
                });
            }

            function setSyncModeFields(item) {
                var mode = item.syncMode || 'manual';
                document.getElementById('syncMode').value = mode;
                document.getElementById('syncIntervalValue').value = item.intervalValue || (item.intervalMinutes ? item.intervalMinutes : 1);
                var unit = item.intervalUnit || (item.intervalMinutes ? 'minutes' : 'minutes');
                document.getElementById('syncIntervalUnit').value = unit;
                document.getElementById('syncScheduledTime').value = item.scheduledTime || '08:00';
                document.getElementById('syncIntervalValue').style.display = mode === 'interval' ? '' : 'none';
                document.getElementById('syncIntervalUnit').style.display = mode === 'interval' ? '' : 'none';
                document.getElementById('syncScheduledTime').style.display = mode === 'scheduled' ? '' : 'none';
            }

            function editBinding(idx) {
                ajax('GET', '/api/sync/config', null, function(xhr) {
                    if (xhr.status === 200) {
                        var list = JSON.parse(xhr.responseText);
                        var item = list[idx];
                        if (item) {
                            document.getElementById('syncUrl').value = item.url;
                            document.getElementById('syncPath').value = item.localPath;
                            document.getElementById('syncIsRegex').checked = !!item.isRegex;
                            setSyncModeFields(item);
                            editIndex = idx;
                            document.querySelector('.btn-add').textContent = '更新';
                            toggleRegexHint();
                        }
                    }
                });
            }

            function getSyncModeFields() {
                var mode = document.getElementById('syncMode').value;
                var fields = { syncMode: mode };
                if (mode === 'interval') {
                    fields.intervalValue = parseInt(document.getElementById('syncIntervalValue').value) || 1;
                    fields.intervalUnit = document.getElementById('syncIntervalUnit').value;
                }
                if (mode === 'scheduled') fields.scheduledTime = document.getElementById('syncScheduledTime').value || '08:00';
                return fields;
            }

            function addBinding() {
                var url = document.getElementById('syncUrl').value.trim();
                var localPath = document.getElementById('syncPath').value.trim();
                if (!url || !localPath) { showToast('请填写 URL 和本地路径'); return; }
                var isRegex = document.getElementById('syncIsRegex').checked;
                var sm = getSyncModeFields();

                var ok = function() {
                    document.getElementById('syncUrl').value = '';
                    document.getElementById('syncPath').value = '';
                    document.getElementById('syncIsRegex').checked = false;
                    document.getElementById('syncMode').value = 'manual';
                    document.getElementById('syncIntervalValue').style.display = 'none';
                    document.getElementById('syncIntervalUnit').style.display = 'none';
                    document.getElementById('syncScheduledTime').style.display = 'none';
                    editIndex = null;
                    document.querySelector('.btn-add').textContent = '添加';
                    toggleRegexHint();
                    loadBindings();
                };

                if (editIndex !== null) {
                    ajax('PUT', '/api/sync/config', JSON.stringify({ index: editIndex, url: url, localPath: localPath, isRegex: isRegex, syncMode: sm.syncMode, intervalValue: sm.intervalValue, intervalUnit: sm.intervalUnit, scheduledTime: sm.scheduledTime }), function(xhr) {
                        if (xhr.status === 200) { ok(); showToast('✅ 已更新'); }
                    });
                } else {
                    ajax('POST', '/api/sync/config', JSON.stringify({ url: url, localPath: localPath, isRegex: isRegex, syncMode: sm.syncMode, intervalValue: sm.intervalValue, intervalUnit: sm.intervalUnit, scheduledTime: sm.scheduledTime }), function(xhr) {
                        if (xhr.status === 200) { ok(); showToast('✅ 已添加'); }
                    });
                }
            }

            function removeOne(index) {
                if (!confirm('确定删除此绑定？')) return;
                ajax('DELETE', '/api/sync/config?index=' + index, null, function(xhr) {
                    if (xhr.status === 200) { loadBindings(); showToast('✅ 已删除'); }
                });
            }

            function toggleRegexHint() {
                var hint = document.getElementById('regexHint');
                if (hint) hint.style.display = document.getElementById('syncIsRegex').checked ? '' : 'none';
            }

            function runRegexTest() {
                var url = document.getElementById('testUrl').value.trim();
                if (!url) { showToast('请填写 URL'); return; }
                document.getElementById('testResults').style.display = 'block';
                document.getElementById('testResultList').innerHTML = '<div class="test-empty">⏳ 测试中...</div>';
                ajax('POST', '/api/sync/test', JSON.stringify({ url: url }), function(xhr) {
                    if (xhr.status === 200) {
                        try {
                            var data = JSON.parse(xhr.responseText);
                            var html = '<div class="test-result-item" style="background:#f0fdf4;border-color:#86efac">' +
                                '<div class="test-url">🔗 ' + escapeHtml(data.resolvedUrl) + '</div>' +
                                '</div>';
                            document.getElementById('testResultList').innerHTML = html;
                        } catch(e) {
                            document.getElementById('testResultList').innerHTML = '<div class="test-empty">❌ 解析结果失败: ' + e.message + '</div>';
                        }
                    } else {
                        document.getElementById('testResultList').innerHTML = '<div class="test-empty">❌ 请求失败</div>';
                    }
                });
            }

            function syncOne(index) {
                ajax('POST', '/api/sync/run?index=' + index, null, function(xhr) {
                    if (xhr.status === 200) {
                        try {
                            var r = JSON.parse(xhr.responseText);
                            if (Array.isArray(r)) {
                                if (r.length === 0) { showToast('⚠️ 本地无匹配文件'); return; }
                                var ok = 0, fail = 0, firstErr = '';
                                for (var i = 0; i < r.length; i++) {
                                    if (r[i].success) ok++;
                                    else { fail++; if (!firstErr) firstErr = r[i].error; }
                                }
                                if (fail === 0) showToast('✅ 全部成功 (' + ok + ')');
                                else showToast('⚠️ ' + ok + '成功 ' + fail + '失败 - ' + firstErr);
                            } else {
                                showToast(r.success ? '✅ 同步成功' : '❌ ' + (r.error || '同步失败'));
                            }
                            loadBindings();
                            refreshSyncSection();
                        } catch(e) { showToast('✅ 同步完成'); loadBindings(); refreshSyncSection(); }
                    }
                });
            }

            function syncAll() {
                ajax('POST', '/api/sync/run', null, function(xhr) {
                    if (xhr.status === 200) {
                        try {
                            var results = JSON.parse(xhr.responseText);
                            if (results.length === 0) { showToast('⚠️ 本地无匹配文件'); return; }
                            var ok = 0, fail = 0, firstErr = '';
                            for (var i = 0; i < results.length; i++) {
                                if (results[i].success) ok++;
                                else { fail++; if (!firstErr) firstErr = results[i].error; }
                            }
                            if (fail === 0) showToast('✅ 全部成功 (' + ok + ')');
                            else showToast('⚠️ ' + ok + '成功 ' + fail + '失败 - ' + firstErr);
                            loadBindings();
                            refreshSyncSection();
                        } catch(e) { showToast('✅ 同步完成'); }
                    }
                });
            }

            function refreshSyncSection() {
                ajax('GET', '/api/sync/config', null, function(xhr) {
                    if (xhr.status !== 200) return;
                    var list;
                    try { list = JSON.parse(xhr.responseText); } catch(e) { return; }
                    if (!list || list.length === 0) { var s = document.querySelector('.sync-section'); if (s) s.remove(); return; }
                    var html = '';
                    for (var i = 0; i < list.length; i++) {
                        var b = list[i];
                        var displayUrl = substituteDate(b.url);
                        var modeLabel = b.syncMode === 'interval' ? ' <span class="sync-badge" style="background:#6366f1">每' + (b.intervalValue || b.intervalMinutes || 1) + ({minutes:'分',hours:'时',days:'天',weeks:'周',months:'月'}[b.intervalUnit] || '分') + '</span>' : (b.syncMode === 'scheduled' ? ' <span class="sync-badge" style="background:#6366f1">' + (b.scheduledTime || '08:00') + '</span>' : '');
                        if (b.isRegex) {
                            var displayPath = substituteDate(b.localPath);
                            html += '<div class="sync-item sync-regex"><span class="sync-badge" style="background:#f59e0b">🔀 正则</span>' + modeLabel + '<span class="sync-url" title="' + escapeHtml(b.url) + '">' + escapeHtml(displayUrl) + '</span> → <span class="sync-link" title="' + escapeHtml(b.localPath) + '">' + escapeHtml(displayPath) + '</span>' +
                                '<button class="sync-item-btn" data-idx="' + i + '" title="同步所有匹配文件">同步全部</button>' +
                                '<button class="sync-copy" data-url="' + escapeHtml(displayUrl) + '" title="复制源 URL">📋</button></div>';
                        } else {
                            var fp = substituteDate(b.localPath || '').replace(/^\\//, '');
                            var href = '/' + fp.split('/').map(function(s){ return encodeURIComponent(s); }).join('/');
                            html += '<div class="sync-item">' + modeLabel + '<span class="sync-url" title="' + escapeHtml(b.url) + '">' + escapeHtml(displayUrl) + '</span> → ' +
                                '<a href="' + href + '" class="sync-link" title="' + escapeHtml(b.localPath) + '">' + escapeHtml(fp) + '</a>' +
                                '<button class="sync-copy-path" data-path="' + href + '" title="复制下载链接">📁</button>' +
                                '<button class="sync-copy" data-url="' + escapeHtml(displayUrl) + '" title="复制源 URL">📋</button></div>';
                        }
                    }
                    var el = document.querySelector('.sync-section');
                    if (el) el.innerHTML = html;
                    else {
                        var container = document.querySelector('.container');
                        if (container) {
                            var div = document.createElement('div');
                            div.className = 'sync-section';
                            div.innerHTML = html;
                            var table = container.querySelector('table');
                            if (table) table.parentNode.insertBefore(div, table);
                            else container.appendChild(div);
                        }
                    }
                    document.querySelectorAll('.sync-copy').forEach(function(btn) {
                        btn.onclick = function(e) {
                            e.preventDefault();
                            var url = this.getAttribute('data-url');
                            if (url) copyToClipboard(url);
                        };
                    });
                    document.querySelectorAll('.sync-copy-path').forEach(function(btn) {
                        btn.onclick = function(e) {
                            e.preventDefault();
                            var p = this.getAttribute('data-path');
                            if (p) copyToClipboard(window.location.origin + p);
                        };
                    });
                    document.querySelectorAll('.sync-item-btn').forEach(function(btn) {
                        btn.onclick = function(e) {
                            e.preventDefault();
                            var idx = this.getAttribute('data-idx');
                            if (idx != null) syncOne(parseInt(idx));
                        };
                    });
                });
            }

            document.addEventListener('DOMContentLoaded', function() {
                document.querySelectorAll('.btn-copy').forEach(function(btn) {
                    btn.addEventListener('click', function(e) {
                        e.preventDefault();
                        var p = this.getAttribute('data-path');
                        if (p) copyToClipboard(window.location.origin + p);
                    });
                });
                document.querySelectorAll('.btn-delete').forEach(function(btn) {
                    btn.addEventListener('click', function(e) {
                        e.preventDefault();
                        var p = this.getAttribute('data-path');
                        if (p) deleteFile(p);
                    });
                });
                document.querySelectorAll('.sync-copy').forEach(function(btn) {
                    btn.addEventListener('click', function(e) {
                        e.preventDefault();
                        var url = this.getAttribute('data-url');
                        if (url) copyToClipboard(url);
                    });
                });
                document.querySelectorAll('.sync-copy-path').forEach(function(btn) {
                    btn.addEventListener('click', function(e) {
                        e.preventDefault();
                        var p = this.getAttribute('data-path');
                        if (p) copyToClipboard(window.location.origin + p);
                    });
                });
                document.querySelectorAll('.sync-item-btn').forEach(function(btn) {
                    btn.addEventListener('click', function(e) {
                        e.preventDefault();
                        var idx = this.getAttribute('data-idx');
                        if (idx != null) syncOne(parseInt(idx));
                    });
                });
                var syncBtn = document.getElementById('btnSyncSettings');
                if (syncBtn) syncBtn.onclick = function() {
                    editIndex = null;
                    document.querySelector('.btn-add').textContent = '添加';
                    document.getElementById('syncUrl').value = '';
                    document.getElementById('syncPath').value = '';
                    document.getElementById('syncModal').classList.add('active');
                    loadBindings();
                };
                var testBtn = document.getElementById('btnRegexTest');
                if (testBtn) testBtn.onclick = function() {
                    document.getElementById('testUrl').value = '';
                    document.getElementById('testResults').style.display = 'none';
                    document.getElementById('regexTestModal').classList.add('active');
                };
                var runTestBtn = document.getElementById('btnRunTest');
                if (runTestBtn) runTestBtn.onclick = runRegexTest;
                var addBtn = document.querySelector('.btn-add');
                if (addBtn) addBtn.onclick = addBinding;
                var syncAllBtn = document.querySelector('.btn-sync-all');
                if (syncAllBtn) syncAllBtn.onclick = syncAll;
                var closeBtns = document.querySelectorAll('.modal .btn-close');
                closeBtns.forEach(function(btn) {
                    btn.onclick = function() {
                        document.getElementById('syncModal').classList.remove('active');
                        document.getElementById('regexTestModal').classList.remove('active');
                    };
                });
                var regexCheck = document.getElementById('syncIsRegex');
                if (regexCheck) regexCheck.onchange = toggleRegexHint;
                var smSelect = document.getElementById('syncMode');
                if (smSelect) smSelect.onchange = function() {
                    var v = this.value;
                    document.getElementById('syncIntervalValue').style.display = v === 'interval' ? '' : 'none';
                    document.getElementById('syncIntervalUnit').style.display = v === 'interval' ? '' : 'none';
                    document.getElementById('syncScheduledTime').style.display = v === 'scheduled' ? '' : 'none';
                };
            });
        })();
    </script>
</head>
<body>
<div class="container">
    <h1>📂 文件目录浏览 <button id="btnSyncSettings" class="btn-sync-settings" title="外链同步设置">⚙️</button><button id="btnRegexTest" class="btn-sync-settings" title="正则测试">🧪</button></h1>
    <div class="sub">当前路径: ${escapeHtml(displayPath)} (工作目录: ${escapeHtml(baseDir)})</div>
    ${parentLink}
    ${syncSection}
    <table>
        <thead>
            <tr><th>类型</th><th>名称</th><th>大小</th><th>修改时间</th><th>操作</th></tr>
        </thead>
        <tbody>${rows}</tbody>
    </table>
    <div class="footer-note">
        ✨ 拖拽文件到页面即可上传。⚙️ 按钮可配置外链自动同步。
    </div>
</div>
<div id="dropZone" class="drop-zone" style="position:fixed;inset:0;z-index:9998;display:none;align-items:center;justify-content:center;background:rgba(37,99,235,0.08);backdrop-filter:blur(4px);font-size:1.5rem;font-weight:600;color:#1e40af;">
    <div style="background:white;border:3px dashed #3b82f6;border-radius:24px;padding:48px 64px;text-align:center;box-shadow:0 16px 48px rgba(0,0,0,0.12);">
        <div style="font-size:3rem;">📤</div>
        <div style="margin-top:12px;">释放文件以上传到当前目录</div>
        <div style="font-size:0.9rem;color:#64748b;font-weight:400;margin-top:4px;">${escapeHtml(displayPath)}</div>
    </div>
</div>
<div id="syncModal" class="modal-overlay">
    <div class="modal">
        <h2>⚙️ 外链同步设置</h2>
        <div class="form-row">
            <input id="syncUrl" type="text" placeholder="外部 URL">
            <input id="syncPath" type="text" placeholder="本地路径（如 data/file.json）">
            <button class="btn-add">添加</button>
        </div>
        <div class="form-row" style="gap:12px;align-items:center">
            <label style="display:flex;align-items:center;gap:4px;font-size:0.85rem;cursor:pointer">
                <input id="syncIsRegex" type="checkbox"> 启用正则匹配
            </label>
            <span id="regexHint" style="display:none;font-size:0.8rem;color:#f59e0b">URL 可用 (\d+) 等捕获组，本地路径用 $1、$2 引用</span>
        </div>
        <div class="form-row" style="gap:8px;align-items:center;flex-wrap:wrap">
            <label style="font-size:0.85rem;white-space:nowrap">同步方式：</label>
            <select id="syncMode" style="padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:0.85rem;flex:1;min-width:100px">
                <option value="manual"> 手动 </option>
                <option value="interval"> 间隔 </option>
                <option value="scheduled">定时（每日）</option>
            </select>
            <input id="syncIntervalValue" type="number" min="1" value="1" style="width:60px;display:none;padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:0.85rem">
            <select id="syncIntervalUnit" style="display:none;padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:0.85rem">
                <option value="minutes">分钟</option>
                <option value="hours">小时</option>
                <option value="days">天</option>
                <option value="weeks">周</option>
                <option value="months">月</option>
            </select>
            <input id="syncScheduledTime" type="time" value="08:00" style="display:none;padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:0.85rem">
        </div>
        <ul id="bindingList" class="binding-list"><li style="color:#94a3b8;text-align:center;justify-content:center">暂无绑定</li></ul>
        <button class="btn-sync-all">🔄 同步全部</button>
        <div style="margin-top:12px;text-align:right"><button class="btn-close">关闭</button></div>
    </div>
</div>
<div id="regexTestModal" class="modal-overlay">
    <div class="modal">
        <h2>🧪 URL 模式测试</h2>
        <div class="form-row">
            <input id="testUrl" type="text" placeholder="URL 模式（如 https://example.com/{date}/file.json）">
        </div>
        <div style="margin-top:12px;text-align:right">
            <button id="btnRunTest" class="btn-add">测试</button>
            <button class="btn-close">关闭</button>
        </div>
        <div id="testResults" style="margin-top:12px;display:none">
            <div id="testResultList"></div>
        </div>
    </div>
</div>
</body>
</html>`;
}

module.exports = { generateDirectoryListing };
