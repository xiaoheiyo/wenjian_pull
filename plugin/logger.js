const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, 'logs');
const RETENTION_DAYS = 15;

function ensureLogDir() {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function formatTimestamp(ts) {
    return ts.getFullYear() + '-' + String(ts.getMonth() + 1).padStart(2, '0') + '-' + String(ts.getDate()).padStart(2, '0') + ' ' +
        String(ts.getHours()).padStart(2, '0') + ':' + String(ts.getMinutes()).padStart(2, '0') + ':' + String(ts.getSeconds()).padStart(2, '0') + '.' + String(ts.getMilliseconds()).padStart(3, '0');
}

function appendLog(level, message) {
    ensureLogDir();
    const ts = new Date();
    const date = ts.getFullYear() + '-' + String(ts.getMonth() + 1).padStart(2, '0') + '-' + String(ts.getDate()).padStart(2, '0');
    const line = '[' + formatTimestamp(ts) + '] [' + level + '] ' + message + '\n';
    try { fs.appendFileSync(path.join(LOG_DIR, date + '.log'), line, 'utf-8'); } catch (e) {}
}

function cleanOldLogs() {
    ensureLogDir();
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    try {
        fs.readdirSync(LOG_DIR).forEach(f => {
            if (!f.endsWith('.log')) return;
            const s = fs.statSync(path.join(LOG_DIR, f));
            if (s.mtimeMs < cutoff) fs.unlinkSync(path.join(LOG_DIR, f));
        });
    } catch (e) {}
}

function info(m) { appendLog('INFO', m); }
function warn(m) { appendLog('WARN', m); }
function error(m) { appendLog('ERROR', m); }
function logChange(filename) {
    const ts = new Date();
    const t = formatTimestamp(ts);
    appendLog('CHANGE', t + ' 文件变更: ' + filename);
}

info('日志模块已初始化');
cleanOldLogs();

module.exports = { info, warn, error, logChange, cleanOldLogs };
