const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const router = require('./router');
const syncConfig = require('./sync-config');
const { isPathBlocked } = require('./security');

function fetchUrl(url, redirects) {
    if (redirects == null) redirects = 0;
    if (redirects > 5) return Promise.reject(new Error('重定向次数过多'));
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        const req = client.get(url, { timeout: 30000 }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const loc = new URL(res.headers.location, url).href;
                resolve(fetchUrl(loc, redirects + 1));
                return;
            }
            if (res.statusCode < 200 || res.statusCode >= 300) {
                reject(new Error('HTTP ' + res.statusCode));
                return;
            }
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        });
        req.on('error', reject);
        req.on('timeout', function() { req.destroy(); reject(new Error('请求超时')); });
    });
}

function substituteDate(str) {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const YYYY = now.getFullYear();
    const MM = pad(now.getMonth() + 1);
    const DD = pad(now.getDate());
    const HH = pad(now.getHours());
    const mm = pad(now.getMinutes());
    const ss = pad(now.getSeconds());
    return str
        .replace(/\{YYYY\}/g, YYYY)
        .replace(/\{MM\}/g, MM)
        .replace(/\{DD\}/g, DD)
        .replace(/\{HH\}/g, HH)
        .replace(/\{mm\}/g, mm)
        .replace(/\{ss\}/g, ss)
        .replace(/\{date\}/g, `${YYYY}-${MM}-${DD}`)
        .replace(/\{time\}/g, `${HH}:${mm}:${ss}`)
        .replace(/\{datetime\}/g, `${YYYY}-${MM}-${DD} ${HH}:${mm}:${ss}`);
}

function localPathToMatchRegex(localPath) {
    const escaped = localPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('^' + escaped.replace(/\\\$(\d+)/g, '([^/]+)') + '$');
}

function resolveRegexBinding(binding, baseDir) {
    const localPathTmpl = substituteDate(binding.localPath);
    const urlTmpl = substituteDate(binding.url);
    const relPath = localPathTmpl.replace(/^\//, '');
    if (!/\$\d+/.test(relPath)) {
        return [{ url: urlTmpl, localPath: relPath }];
    }
    const regex = localPathToMatchRegex(relPath);
    const parts = relPath.split('/');
    const scanParts = [];
    for (const p of parts) {
        if (/\$\d+/.test(p)) break;
        scanParts.push(p);
    }
    const scanDir = path.resolve(baseDir, scanParts.join('/'));
    const results = [];
    function walk(dir) {
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) { walk(full); continue; }
            const fileRelPath = path.relative(baseDir, full).replace(/\\/g, '/');
            const match = fileRelPath.match(regex);
            if (match) {
                let url = urlTmpl;
                for (let i = 1; i < match.length; i++) {
                    url = url.replace(new RegExp('\\$' + i, 'g'), match[i]);
                }
                results.push({ url, localPath: fileRelPath });
            }
        }
    }
    if (fs.existsSync(scanDir)) walk(scanDir);
    return results;
}

async function syncSinglePair(url, localPath, baseDir) {
    url = substituteDate(url);
    localPath = substituteDate(localPath);
    const targetPath = path.resolve(baseDir, localPath.replace(/^\//, ''));
    if (!targetPath.startsWith(baseDir) || isPathBlocked(targetPath, baseDir)) return { url, localPath, error: '路径非法' };
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    try {
        const data = await fetchUrl(url);
        fs.writeFileSync(targetPath, data);
        return { url, localPath, size: data.length, success: true };
    } catch (e) {
        return { url, localPath, error: e.message };
    }
}

async function syncBinding(binding) {
    const baseDir = process.cwd();
    if (binding.isRegex) {
        const pairs = resolveRegexBinding(binding, baseDir);
        const results = [];
        for (const pair of pairs) results.push(await syncSinglePair(pair.url, pair.localPath, baseDir));
        return results;
    }
    return [await syncSinglePair(binding.url, binding.localPath, baseDir)];
}

async function syncAll() {
    const list = syncConfig.getBindings();
    const results = [];
    for (const b of list) results.push(...await syncBinding(b));
    return results;
}

async function syncOne(index) {
    const list = syncConfig.getBindings();
    if (index < 0 || index >= list.length) return [{ error: '索引无效' }];
    return await syncBinding(list[index]);
}

// Auto-sync state
const autoSyncState = { timer: null, lastSync: {} };

function getTodayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const INTERVAL_UNIT_MS = { minutes: 60000, hours: 3600000, days: 86400000, weeks: 604800000, months: 2592000000 };

function getIntervalMs(b) {
    if (b.intervalMinutes) return b.intervalMinutes * 60000;
    const val = b.intervalValue || 1;
    const unit = b.intervalUnit || 'minutes';
    return val * (INTERVAL_UNIT_MS[unit] || 60000);
}

function intervalLabel(b) {
    if (b.intervalMinutes) return '每' + b.intervalMinutes + '分';
    const val = b.intervalValue || 1;
    const unitNames = { minutes: '分', hours: '时', days: '天', weeks: '周', months: '月' };
    return '每' + val + (unitNames[b.intervalUnit] || '分');
}

async function checkAndSync() {
    const list = syncConfig.getBindings();
    const now = Date.now();
    const today = getTodayStr();
    for (let i = 0; i < list.length; i++) {
        const b = list[i];
        const mode = b.syncMode || 'manual';
        if (mode === 'manual') continue;
        const key = i + '';
        let shouldSync = false;
        if (mode === 'interval') {
            const interval = getIntervalMs(b);
            const last = autoSyncState.lastSync[key] || 0;
            if (now - last >= interval) shouldSync = true;
        } else if (mode === 'scheduled') {
            const lastDate = autoSyncState.lastSync[key + '_date'] || '';
            if (lastDate !== today) {
                const timeStr = b.scheduledTime || '08:00';
                const [h, m] = timeStr.split(':').map(Number);
                const scheduleMin = h * 60 + (m || 0);
                const currentMin = new Date().getHours() * 60 + new Date().getMinutes();
                if (currentMin >= scheduleMin) shouldSync = true;
            }
        }
        if (shouldSync) {
            try {
                const results = await syncBinding(b);
                autoSyncState.lastSync[key] = Date.now();
                if (mode === 'scheduled') autoSyncState.lastSync[key + '_date'] = today;
                console.log(`[自动同步] 绑定 #${i}: ${results.filter(r => r.success).length} 成功, ${results.filter(r => r.error).length} 失败`);
            } catch (e) {
                console.error(`[自动同步] 绑定 #${i} 失败:`, e.message);
            }
        }
    }
}

function startAutoSync() {
    stopAutoSync();
    autoSyncState.timer = setInterval(checkAndSync, 30000);
    console.log('[自动同步] 已启动 (每30秒检查)');
}

function stopAutoSync() {
    if (autoSyncState.timer) { clearInterval(autoSyncState.timer); autoSyncState.timer = null; }
}

// Start auto-sync when module loads
startAutoSync();

router.register('GET', '/api/sync/config', (req, res, ctx) => {
    res.writeHead(200, { ...ctx.sec, 'Content-Type': 'application/json' });
    res.end(JSON.stringify(syncConfig.getBindings()));
});

router.register('POST', '/api/sync/config', (req, res, ctx) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
        try {
            const { url, localPath, isRegex, syncMode, intervalValue, intervalUnit, scheduledTime } = JSON.parse(body);
            res.writeHead(200, { ...ctx.sec, 'Content-Type': 'application/json' });
            res.end(JSON.stringify(syncConfig.addBinding(url, localPath, !!isRegex, syncMode, intervalValue, intervalUnit, scheduledTime)));
        } catch (e) {
            res.writeHead(400, { ...ctx.sec, 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: '请求格式错误' }));
        }
    });
});

router.register('PUT', '/api/sync/config', (req, res, ctx) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
        try {
            const { index, url, localPath, isRegex, syncMode, intervalValue, intervalUnit, scheduledTime } = JSON.parse(body);
            res.writeHead(200, { ...ctx.sec, 'Content-Type': 'application/json' });
            res.end(JSON.stringify(syncConfig.updateBinding(index, url, localPath, !!isRegex, syncMode, intervalValue, intervalUnit, scheduledTime)));
        } catch (e) {
            res.writeHead(400, { ...ctx.sec, 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: '请求格式错误' }));
        }
    });
});

router.register('GET', '/api/sync/resolve', (req, res, ctx) => {
    const idx = ctx.searchParams.get('index');
    const list = syncConfig.getBindings();
    const baseDir = process.cwd();
    if (idx != null) {
        const i = parseInt(idx);
        if (i >= 0 && i < list.length && list[i].isRegex) {
            res.writeHead(200, { ...ctx.sec, 'Content-Type': 'application/json' });
            res.end(JSON.stringify(resolveRegexBinding(list[i], baseDir)));
            return;
        }
        res.writeHead(200, { ...ctx.sec, 'Content-Type': 'application/json' });
        res.end(JSON.stringify([]));
        return;
    }
    const all = [];
    for (const b of list) {
        if (b.isRegex) all.push(...resolveRegexBinding(b, baseDir));
        else all.push({ url: substituteDate(b.url), localPath: substituteDate(b.localPath) });
    }
    res.writeHead(200, { ...ctx.sec, 'Content-Type': 'application/json' });
    res.end(JSON.stringify(all));
});

router.register('DELETE', '/api/sync/config', (req, res, ctx) => {
    const idx = ctx.searchParams.get('index');
    res.writeHead(200, { ...ctx.sec, 'Content-Type': 'application/json' });
    res.end(JSON.stringify(syncConfig.removeBinding(parseInt(idx))));
});

router.register('POST', '/api/sync/run', (req, res, ctx) => {
    const idx = ctx.searchParams.get('index');
    const p = idx != null ? syncOne(parseInt(idx)) : syncAll();
    p.then(results => {
        res.writeHead(200, { ...ctx.sec, 'Content-Type': 'application/json' });
        res.end(JSON.stringify(results));
    });
});

router.register('POST', '/api/sync/test', (req, res, ctx) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
        try {
            const { url, localPath } = JSON.parse(body);
            const resolvedUrl = substituteDate(url || '');
            const resolvedPath = localPath ? substituteDate(localPath) : '';
            res.writeHead(200, { ...ctx.sec, 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ resolvedUrl, resolvedPath }));
        } catch (e) {
            res.writeHead(400, { ...ctx.sec, 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
    });
});

module.exports = { substituteDate, startAutoSync, stopAutoSync };
