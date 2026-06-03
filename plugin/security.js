const path = require('path');

const SENSITIVE_NAMES = new Set([
    'node_modules', '.git', '.svn', '.hg', '.env', '.DS_Store',
    'thumbs.db', 'desktop.ini', '.npm', '.yarn', 'plugin'
]);

const HIDDEN_PREFIX = '.';

function isHidden(name) {
    return name.startsWith(HIDDEN_PREFIX);
}

function isSensitive(name) {
    return SENSITIVE_NAMES.has(name);
}

function isPathBlocked(requestedPath, baseDir) {
    const rel = path.relative(baseDir, requestedPath);
    if (!rel) return false;
    const parts = rel.split(path.sep);
    return parts.some(part => isHidden(part) || isSensitive(part));
}

function hasNullByte(str) {
    return str.indexOf('\0') !== -1;
}

function isEncodedTraversal(pathname) {
    return /(%2e%2e%2f|%2e%2e%5c|\.\.\\|\.\.\/)/i.test(pathname);
}

function getSecurityHeaders() {
    return {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'no-referrer',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    };
}

const MAX_PREVIEW_SIZE = 50 * 1024 * 1024;

module.exports = {
    isHidden,
    isSensitive,
    isPathBlocked,
    hasNullByte,
    isEncodedTraversal,
    getSecurityHeaders,
    MAX_PREVIEW_SIZE,
};
