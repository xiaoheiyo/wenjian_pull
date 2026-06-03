function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"]/g, (m) => m === '&' ? '&amp;' : (m === '<' ? '&lt;' : (m === '>' ? '&gt;' : '&quot;')));
}

function formatFileSize(bytes) {
    if (bytes == null) return '?';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatTime(ts) {
    if (!ts) return '—';
    const y = ts.getFullYear();
    const M = String(ts.getMonth() + 1).padStart(2, '0');
    const d = String(ts.getDate()).padStart(2, '0');
    const h = String(ts.getHours()).padStart(2, '0');
    const m = String(ts.getMinutes()).padStart(2, '0');
    return y + '-' + M + '-' + d + ' ' + h + ':' + m;
}

module.exports = { escapeHtml, formatFileSize, formatTime };
