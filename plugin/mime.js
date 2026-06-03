const path = require('path');

const mimeTypes = {
    '.html': 'text/html', '.htm': 'text/html', '.css': 'text/css',
    '.js': 'application/javascript', '.json': 'application/json',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.svg': 'image/svg+xml', '.txt': 'text/plain',
    '.md': 'text/markdown', '.pdf': 'application/pdf', '.zip': 'application/zip',
    '.gz': 'application/gzip', '.tar': 'application/x-tar', '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4', '.woff': 'font/woff', '.woff2': 'font/woff2',
    '.xml': 'application/xml', '.log': 'text/plain', '.sh': 'application/x-shellscript',
    '.py': 'text/x-python', '.c': 'text/x-c', '.cpp': 'text/x-c++', '.java': 'text/x-java',
};

function getContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return mimeTypes[ext] || 'application/octet-stream';
}

module.exports = { getContentType };
